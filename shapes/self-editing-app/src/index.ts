import { DurableObject } from 'cloudflare:workers';

type Env = { readonly BODY: DurableObjectNamespace<Body>; readonly LOADER: WorkerLoader };

type ShipResult = {
  readonly shipped: boolean;
  readonly version: number;
  readonly live: number;
  readonly reason: string;
};

const loadVersion = (env: Env, id: string, source: string) =>
  env.LOADER.get(id, () => ({
    compatibilityDate: '2026-09-30',
    mainModule: 'app.js',
    modules: { 'app.js': source },
    globalOutbound: null,
  })).getEntrypoint();

const gate = async (env: Env, id: string, source: string): Promise<string> => {
  try {
    const response = await loadVersion(env, id, source).fetch('https://app/__check');
    if (!response.ok) return `check status ${response.status}`;
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'ok' in body && body.ok === true) return '';
    return 'check returned not ok';
  } catch (error) {
    return `boot failed: ${String(error)}`;
  }
};

export class Body extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS versions (n INTEGER PRIMARY KEY, source TEXT, passed INTEGER)',
    );
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS live (k INTEGER PRIMARY KEY, n INTEGER)');
  }

  live(): { readonly n: number; readonly source: string } | null {
    const rows = this.ctx.storage.sql
      .exec<{ n: number; source: string }>(
        'SELECT v.n AS n, v.source AS source FROM live l JOIN versions v ON v.n = l.n',
      )
      .toArray();
    return rows[0] ?? null;
  }

  async ship(user: string, source: string): Promise<ShipResult> {
    const version =
      this.ctx.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM versions').one().n + 1;
    const reason = await gate(this.env, `${user}:${version}`, source);
    const passed = reason === '';
    this.ctx.storage.sql.exec(
      'INSERT INTO versions (n, source, passed) VALUES (?, ?, ?)',
      version,
      source,
      passed ? 1 : 0,
    );
    if (passed) this.ctx.storage.sql.exec('INSERT OR REPLACE INTO live (k, n) VALUES (1, ?)', version);
    return { shipped: passed, version, live: this.live()?.n ?? 0, reason };
  }

  rollback(): number {
    const current = this.live()?.n ?? 0;
    const previous = this.ctx.storage.sql
      .exec<{ n: number }>(
        'SELECT n FROM versions WHERE passed = 1 AND n < ? ORDER BY n DESC LIMIT 1',
        current,
      )
      .toArray()[0];
    if (previous !== undefined)
      this.ctx.storage.sql.exec('INSERT OR REPLACE INTO live (k, n) VALUES (1, ?)', previous.n);
    return this.live()?.n ?? 0;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const user = url.searchParams.get('u') ?? 'default';
    const body = env.BODY.get(env.BODY.idFromName(user));
    if (url.pathname === '/ship' && request.method === 'POST')
      return Response.json(await body.ship(user, await request.text()));
    if (url.pathname === '/rollback') return Response.json({ live: await body.rollback() });
    if (url.pathname === '/app') {
      const live = await body.live();
      if (live === null) return Response.json({ live: 0, text: '' });
      const response = await loadVersion(env, `${user}:${live.n}`, live.source).fetch('https://app/');
      return Response.json({ live: live.n, text: await response.text() });
    }
    return Response.json({ shape: 'self-editing-app' });
  },
} satisfies ExportedHandler<Env>;
