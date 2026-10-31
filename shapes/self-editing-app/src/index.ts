import { Type } from '@earendil-works/pi-ai';
import { defineExtension, defineTool } from '@earendil-works/pi-durable';
import { type AgentEnv, piAgent } from '../../kit/agent.ts';
import type { WorkerLoader } from '../../kit/loader-tests.ts';
import { type FileStore, MemoryExecutionEnv, sqliteFileStore } from '../../kit/memory-env.ts';
import { piRouter } from '../../kit/router.ts';

type Env = AgentEnv & { readonly BODY: DurableObjectNamespace<Body>; readonly LOADER: WorkerLoader };

const WORKSPACE = '/workspace';
const APP = `${WORKSPACE}/app.js`;
const STARTER = `export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/__check') return Response.json({ ok: true });
    return new Response('hello from version 1');
  },
};
`;

const decoder = new TextDecoder();

const loadVersion = (loader: WorkerLoader, id: string, source: string) =>
  loader
    .get(id, () => ({
      compatibilityDate: '2026-09-30',
      compatibilityFlags: [],
      mainModule: 'app.js',
      modules: { 'app.js': source },
      globalOutbound: null,
      env: {},
    }))
    .getEntrypoint();

const gate = async (loader: WorkerLoader, id: string, source: string) => {
  try {
    const response = await loadVersion(loader, id, source).fetch('https://app/__check');
    if (!response.ok) return `check returned HTTP ${response.status}`;
    const body: unknown = await response.json();
    return typeof body === 'object' && body !== null && Reflect.get(body, 'ok') === true
      ? ''
      : 'check returned not ok';
  } catch (error) {
    return `boot failed: ${String(error)}`;
  }
};

const versions = (sql: SqlStorage) => {
  sql.exec(
    'CREATE TABLE IF NOT EXISTS versions (n INTEGER PRIMARY KEY, source TEXT, passed INTEGER, reason TEXT)',
  );
  sql.exec('CREATE TABLE IF NOT EXISTS live (k INTEGER PRIMARY KEY, n INTEGER)');
  return {
    live: () =>
      sql
        .exec<{ n: number; source: string }>(
          'SELECT v.n AS n, v.source AS source FROM live l JOIN versions v ON v.n = l.n',
        )
        .toArray()[0],
    count: () => sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM versions').one().n,
    record: (source: string, reason: string) => {
      sql.exec(
        'INSERT INTO versions (source, passed, reason) VALUES (?, ?, ?)',
        source,
        reason === '' ? 1 : 0,
        reason,
      );
      const n = sql.exec<{ n: number }>('SELECT MAX(n) AS n FROM versions').one().n;
      if (reason === '') sql.exec('INSERT OR REPLACE INTO live (k, n) VALUES (1, ?)', n);
      return n;
    },
  };
};

const workspace = (ctx: DurableObjectState): FileStore => {
  const store = sqliteFileStore(ctx.storage.sql, 'workspace');
  if (store.load()[APP] === undefined) store.save(APP, new TextEncoder().encode(STARTER));
  return store;
};

const shipTool = (env: Env, ctx: DurableObjectState) =>
  defineExtension({
    name: 'ship',
    tools: [
      defineTool({
        name: 'ship_app',
        description:
          'Ship /workspace/app.js as the next live version. It goes live only if it boots in a fresh Worker Loader isolate and GET /__check returns {"ok": true}; otherwise the old version stays live and you get the reason.',
        parameters: Type.Object({}),
        execute: async () => {
          const source = decoder.decode(workspace(ctx).load()[APP] ?? new Uint8Array());
          const store = versions(ctx.storage.sql);
          const reason = await gate(env.LOADER, `${ctx.id.toString()}:${store.count() + 1}`, source);
          const n = store.record(source, reason);
          return {
            output: [
              {
                type: 'text',
                text: reason === '' ? `version ${n} is live` : `version ${n} was refused: ${reason}`,
              },
            ],
          };
        },
      }),
    ],
  });

export class Body extends piAgent<Env>({
  name: 'self-editing-app',
  instructions:
    'You maintain a small web app, /workspace/app.js, a Worker module with a default fetch handler. It must keep answering GET /__check with {"ok": true}. Edit it with the tools, then call ship_app; if a version is refused, fix it and ship again. Reply in one short sentence.',
  environment: (_env, ctx) =>
    new MemoryExecutionEnv({
      id: `self-editing-app:${ctx.id.toString()}`,
      cwd: WORKSPACE,
      store: workspace(ctx),
    }),
  extensions: (env, ctx) => [shipTool(env, ctx)],
  probe: async (env, ctx) => {
    const live = versions(ctx.storage.sql).live();
    if (live === undefined) return { facts: { live: 0, text: '', shipped: 0 } };
    const response = await loadVersion(env.LOADER, `${ctx.id.toString()}:${live.n}`, live.source).fetch(
      'https://app/',
    );
    return {
      facts: { live: live.n, text: await response.text(), shipped: versions(ctx.storage.sql).count() },
    };
  },
}) {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      const store = versions(ctx.storage.sql);
      if (store.live() === undefined) store.record(STARTER, '');
    });
  }
}

export default piRouter<Env>({
  shape: 'self-editing-app',
  agent: (env, name) => env.BODY.get(env.BODY.idFromName(name)),
  gateway: (env) => env.GATEWAY,
});
