import { DurableObject } from 'cloudflare:workers';

type Env = {
  readonly DIRECTORY: DurableObjectNamespace<Directory>;
  readonly HARK: DurableObjectNamespace<Hark>;
};

type Box = { readonly boot: string; readonly note: string };

type Message = { readonly n: number; readonly text: string };

const KEEP = 24;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

export class Directory extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS grants (person TEXT PRIMARY KEY, token TEXT)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS keys (id INTEGER PRIMARY KEY, secret TEXT)');
  }

  private async sign(person: string): Promise<string> {
    const rows = this.ctx.storage.sql
      .exec<{ secret: string }>('SELECT secret FROM keys WHERE id = 1')
      .toArray();
    const secret = rows[0]?.secret ?? crypto.randomUUID();
    if (rows.length === 0) this.ctx.storage.sql.exec('INSERT INTO keys (id, secret) VALUES (1, ?)', secret);
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(person)));
  }

  async grant(person: string, token: string): Promise<string> {
    this.ctx.storage.sql.exec('INSERT OR REPLACE INTO grants (person, token) VALUES (?, ?)', person, token);
    return `${person}.${await this.sign(person)}`;
  }

  async verify(cookie: string): Promise<string | null> {
    const [person = '', signature = ''] = cookie.split('.');
    return person !== '' && signature === (await this.sign(person)) ? person : null;
  }

  token(person: string): string {
    const rows = this.ctx.storage.sql
      .exec<{ token: string }>('SELECT token FROM grants WHERE person = ?', person)
      .toArray();
    return rows[0]?.token ?? '';
  }
}

export class Hark extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS messages (n INTEGER PRIMARY KEY, text TEXT)');
  }

  private async computer(path: string): Promise<Box> {
    const container = this.ctx.container;
    if (container === undefined) throw new Error('no container binding');
    if (!container.running) container.start({ enableInternet: false });
    let last = '';
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        const response = await container.getTcpPort(8080).fetch(`http://computer${path}`);
        if (response.ok) {
          const box: Box = await response.json();
          return box;
        }
        last = String(response.status);
      } catch (error) {
        last = String(error);
      }
      await pause(1000);
    }
    throw new Error(`computer never answered: ${last}`);
  }

  async say(person: string, text: string, write: boolean) {
    const token = await this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName('directory')).token(person);
    const next =
      (this.ctx.storage.sql.exec<{ n: number | null }>('SELECT MAX(n) AS n FROM messages').one().n ?? 0) + 1;
    this.ctx.storage.sql.exec('INSERT INTO messages (n, text) VALUES (?, ?)', next, text);
    this.ctx.storage.sql.exec('DELETE FROM messages WHERE n <= ?', next - KEEP);
    const messages = this.ctx.storage.sql.exec<Message>('SELECT n, text FROM messages ORDER BY n').toArray();
    const box = write ? await this.computer(`/write?text=${encodeURIComponent(text)}`) : null;
    return { person, hasToken: token !== '', messages: messages.length, first: messages[0]?.n ?? 0, box };
  }

  async look(): Promise<Box> {
    return this.computer('/read');
  }

  async stop(): Promise<void> {
    const container = this.ctx.container;
    if (container !== undefined && container.running) await container.destroy();
  }
}

const cookieOf = (request: Request) =>
  /(?:^|;\s*)hark=([^;]+)/.exec(request.headers.get('cookie') ?? '')?.[1] ?? '';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
    if (url.pathname === '/signin') {
      const cookie = await directory.grant(
        url.searchParams.get('p') ?? '',
        url.searchParams.get('token') ?? '',
      );
      return Response.json(
        { signedIn: true },
        { headers: { 'set-cookie': `hark=${cookie}; HttpOnly; Secure; Path=/` } },
      );
    }
    const person = await directory.verify(cookieOf(request));
    if (person === null) return Response.json({ error: 'not signed in' }, { status: 401 });
    const hark = env.HARK.get(env.HARK.idFromName(person));
    if (url.pathname === '/say') {
      return Response.json(
        await hark.say(person, url.searchParams.get('text') ?? '', url.searchParams.has('write')),
      );
    }
    if (url.pathname === '/look') return Response.json(await hark.look());
    if (url.pathname === '/stop') {
      await hark.stop();
      return Response.json({ stopped: true });
    }
    return new Response('person-with-computer shape');
  },
} satisfies ExportedHandler<Env>;
