import { DurableObject } from 'cloudflare:workers';
import { type AgentEnv, piAgent } from '../../kit/agent.ts';
import { boxBoot, containerEnv } from '../../kit/container-env.ts';
import { piRouter } from '../../kit/router.ts';

type Env = AgentEnv & {
  readonly DIRECTORY: DurableObjectNamespace<Directory>;
  readonly PERSON: DurableObjectNamespace<Person>;
};

const COMPUTER = { internet: false } as const;
const PERSON_NAME = /^[a-z0-9-]{1,64}$/;

const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

export class Directory extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS grants (person TEXT PRIMARY KEY, token TEXT)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS keys (id INTEGER PRIMARY KEY, secret TEXT)');
  }

  async #sign(person: string) {
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

  async grant(person: string, token: string) {
    this.ctx.storage.sql.exec('INSERT OR REPLACE INTO grants (person, token) VALUES (?, ?)', person, token);
    return `${person}.${await this.#sign(person)}`;
  }

  async verify(cookie: string) {
    const [person = '', signature = ''] = cookie.split('.');
    return person !== '' && signature === (await this.#sign(person)) ? person : null;
  }

  holds(person: string) {
    return this.ctx.storage.sql.exec('SELECT 1 FROM grants WHERE person = ?', person).toArray().length > 0;
  }
}

export class Person extends piAgent<Env>({
  name: 'person-with-computer',
  instructions:
    'You are the personal agent of one signed-in person. You have their own computer: a shell, Python and Node in /workspace, no internet. Do the work with the tools, check it, then reply in one short sentence.',
  environment: (_env, ctx) => containerEnv(ctx, `person:${ctx.id.toString()}`, COMPUTER),
  probe: async (_env, ctx) => ({ facts: { boot: await boxBoot(ctx, COMPUTER) } }),
}) {}

const cookieOf = (request: Request) =>
  /(?:^|;\s*)person=([^;]+)/.exec(request.headers.get('cookie') ?? '')?.[1] ??
  /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1] ??
  '';

const directoryOf = (env: Env) => env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));

export default piRouter<Env>({
  shape: 'person-with-computer',
  agent: (env, name) => env.PERSON.get(env.PERSON.idFromName(name)),
  gateway: (env) => env.GATEWAY,
  identify: (request, env) => directoryOf(env).verify(cookieOf(request)),
  extra: async (request, env) => {
    const url = new URL(request.url);
    if (url.pathname !== '/signin') return undefined;
    const person = url.searchParams.get('p') ?? '';
    const token = url.searchParams.get('token') ?? '';
    if (!PERSON_NAME.test(person) || token === '')
      return Response.json({ error: 'p and token are required' }, { status: 400 });
    const cookie = await directoryOf(env).grant(person, token);
    return Response.json(
      { signedIn: true, cookie, held: await directoryOf(env).holds(person) },
      { headers: { 'set-cookie': `person=${cookie}; HttpOnly; Secure; Path=/` } },
    );
  },
});
