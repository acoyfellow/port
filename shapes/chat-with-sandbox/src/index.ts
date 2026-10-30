import { DurableObject } from 'cloudflare:workers';

type Env = { readonly CHAT: DurableObjectNamespace<Chat> };

type Box = { readonly boot: string; readonly note: string };

type Turn = { readonly n: number; readonly text: string; readonly reply: string };

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class Chat extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS turns (n INTEGER PRIMARY KEY, text TEXT, reply TEXT)');
  }

  private async box(path: string): Promise<Box> {
    const container = this.ctx.container;
    if (container === undefined) throw new Error('no container binding');
    if (!container.running) container.start({ enableInternet: false });
    let last = '';
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        const response = await container.getTcpPort(8080).fetch(`http://box${path}`);
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
    throw new Error(`box never answered: ${last}`);
  }

  async turn(text: string): Promise<{ readonly box: Box; readonly turns: readonly Turn[] }> {
    const box = text.startsWith('write ')
      ? await this.box(`/write?text=${encodeURIComponent(text.slice(6))}`)
      : await this.box('/read');
    const next = this.ctx.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM turns').one().n + 1;
    this.ctx.storage.sql.exec('INSERT INTO turns (n, text, reply) VALUES (?, ?, ?)', next, text, box.note);
    const turns = this.ctx.storage.sql.exec<Turn>('SELECT n, text, reply FROM turns ORDER BY n').toArray();
    return { box, turns };
  }

  async stop(): Promise<void> {
    const container = this.ctx.container;
    if (container !== undefined && container.running) await container.destroy();
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const chat = env.CHAT.get(env.CHAT.idFromName(url.searchParams.get('c') ?? 'default'));
    if (url.pathname === '/turn')
      return Response.json(await chat.turn(url.searchParams.get('text') ?? 'read'));
    if (url.pathname === '/stop') {
      await chat.stop();
      return Response.json({ stopped: true });
    }
    return new Response('chat-with-sandbox shape');
  },
} satisfies ExportedHandler<Env>;
