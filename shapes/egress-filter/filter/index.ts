import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';

export type FilterEnv = { readonly LOG: DurableObjectNamespace<Log> };

export const ALLOWED_HOSTS = ['example.com'];

export type LogEntry = { readonly host: string; readonly path: string; readonly allowed: boolean };

export class Log extends DurableObject<FilterEnv> {
  constructor(ctx: DurableObjectState, env: FilterEnv) {
    super(ctx, env);
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY, host TEXT, path TEXT, allowed INTEGER)',
    );
  }

  record(host: string, path: string, allowed: boolean) {
    this.ctx.storage.sql.exec(
      'INSERT INTO requests (host, path, allowed) VALUES (?, ?, ?)',
      host,
      path,
      allowed ? 1 : 0,
    );
  }

  entries(): LogEntry[] {
    return this.ctx.storage.sql
      .exec<{ host: string; path: string; allowed: number }>(
        'SELECT host, path, allowed FROM requests ORDER BY id',
      )
      .toArray()
      .map((row) => ({ host: row.host, path: row.path, allowed: row.allowed === 1 }));
  }
}

const log = (env: FilterEnv) => env.LOG.get(env.LOG.idFromName('log'));

export class Egress extends WorkerEntrypoint<FilterEnv> {
  async fetch(request: Request) {
    const url = new URL(request.url);
    const allowed = url.protocol === 'https:' && ALLOWED_HOSTS.includes(url.hostname);
    await log(this.env).record(url.hostname, url.pathname.slice(0, 200), allowed);
    if (!allowed)
      return new Response(`blocked by the egress filter: ${url.hostname} is not on the allow list`, {
        status: 403,
      });
    return fetch(request);
  }
}

export class Audit extends WorkerEntrypoint<FilterEnv> {
  async entries() {
    return log(this.env).entries();
  }
}

export default {
  async fetch() {
    return new Response('not found', { status: 404 });
  },
} satisfies ExportedHandler<FilterEnv>;
