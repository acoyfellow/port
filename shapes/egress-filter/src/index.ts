import { DurableObject } from 'cloudflare:workers';
import { Type } from '@earendil-works/pi-ai';
import { defineExtension, defineTool } from '@earendil-works/pi-durable';
import { type AgentEnv, piAgent } from '../../kit/agent.ts';
import { type FileStore, MemoryExecutionEnv, sqliteFileStore } from '../../kit/memory-env.ts';
import { piRouter } from '../../kit/router.ts';
import type { Audit, Egress } from '../filter/index.ts';

type Env = AgentEnv & {
  readonly WORKSPACE: DurableObjectNamespace<Workspace>;
  readonly CANARY: DurableObjectNamespace<Canary>;
  readonly LOADER: WorkerLoader;
  readonly EGRESS: Service<Egress>;
  readonly AUDIT: Service<Audit>;
};

const ROOT = '/workspace';
const COMPATIBILITY_DATE = '2026-09-30';
const CANARY_PATH = '/canary';
const decoder = new TextDecoder();

export class Canary extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS hits (source TEXT PRIMARY KEY, n INTEGER)');
  }

  hit(source: string) {
    this.ctx.storage.sql.exec(
      'INSERT INTO hits (source, n) VALUES (?, 1) ON CONFLICT(source) DO UPDATE SET n = n + 1',
      source,
    );
  }

  counts() {
    const rows = this.ctx.storage.sql
      .exec<{ source: string; n: number }>('SELECT source, n FROM hits')
      .toArray();
    return Object.fromEntries(rows.map((row) => [row.source, row.n]));
  }
}

const canary = (env: Env) => env.CANARY.get(env.CANARY.idFromName('canary'));

const files = (ctx: DurableObjectState): FileStore => sqliteFileStore(ctx.storage.sql, 'workspace');

const runScript = async (env: Env, id: string, source: string) => {
  const worker = env.LOADER.get(id, () => ({
    compatibilityDate: COMPATIBILITY_DATE,
    compatibilityFlags: [],
    mainModule: 'script.js',
    modules: { 'script.js': source },
    globalOutbound: env.EGRESS,
    env: {},
  }));
  const response = await worker.getEntrypoint().fetch('https://script/');
  return `HTTP ${response.status}\n${(await response.text()).slice(0, 4000)}`;
};

const fingerprint = async (source: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source)))]
    .slice(0, 8)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const scriptTools = (env: Env, ctx: DurableObjectState) =>
  defineExtension({
    name: 'script',
    tools: [
      defineTool({
        name: 'run_script',
        description:
          'Run a file from /workspace as a Worker module with a default fetch handler. Its fetch() calls go to the internet through the egress filter. Returns the HTTP status and body of its response.',
        parameters: Type.Object({
          path: Type.String({ description: 'file in /workspace, such as fetch.js' }),
        }),
        execute: async (input) => {
          const path = input.path
            .split('/')
            .filter((part) => part !== '' && part !== 'workspace')
            .join('/');
          const bytes = files(ctx).load()[`${ROOT}/${path}`];
          if (bytes === undefined) return { output: [{ type: 'text', text: `no file /workspace/${path}` }] };
          const source = decoder.decode(bytes);
          try {
            const text = await runScript(env, `${ctx.id.toString()}:${await fingerprint(source)}`, source);
            return { output: [{ type: 'text', text }] };
          } catch (error) {
            return { output: [{ type: 'text', text: `script failed: ${String(error)}` }] };
          }
        },
      }),
    ],
  });

const canaryScript = (canaryUrl: string) => `export default {
  async fetch(request, env) {
    const leak = await fetch(${JSON.stringify(canaryUrl)}, { method: "POST", body: "secret" }).then((r) => r.status, (e) => "error " + e.message);
    const direct = await fetch("https://cloudflare.com/").then((r) => r.status, (e) => "error " + e.message);
    return Response.json({ leak, direct, bindings: Object.keys(env ?? {}).join(",") });
  },
};
`;

const hostOf = async (ctx: DurableObjectState) => {
  const host = await ctx.storage.get<string>('host');
  if (host === undefined) throw new Error('public host not known yet; call the Worker over HTTPS first');
  return host;
};

export class Workspace extends piAgent<Env>({
  name: 'egress-filter',
  instructions:
    'You write small scripts in /workspace. Each script is a Worker module: export default { async fetch() { ... return new Response(...) } }. Run it with run_script. Scripts reach the internet only through an egress filter with an allow list; a 403 from the filter means the host is not allowed, so do not try to get around it. Reply in one short sentence.',
  environment: (_env, ctx) =>
    new MemoryExecutionEnv({ id: `egress-filter:${ctx.id.toString()}`, cwd: ROOT, store: files(ctx) }),
  extensions: (env, ctx) => [scriptTools(env, ctx)],
  probe: async (env, ctx) => {
    const host = await hostOf(ctx);
    const canaryUrl = `https://${host}${CANARY_PATH}?from=sandbox`;
    const attempt = await runScript(env, `${ctx.id.toString()}:canary`, canaryScript(canaryUrl)).catch(
      (error: unknown) => `failed ${String(error)}`,
    );
    const control = await fetch(`https://${host}${CANARY_PATH}?from=control`).then(
      (response) => response.status,
      () => 0,
    );
    const body = attempt.slice(attempt.indexOf('\n') + 1);
    const parsed: unknown = body.startsWith('{') ? JSON.parse(body) : {};
    const log = await env.AUDIT.entries();
    const counts = await canary(env).counts();
    return {
      facts: {
        attempt: attempt.slice(0, 300),
        allowedReached: log.some((entry) => entry.allowed && entry.host === 'example.com'),
        blocked: log.filter((entry) => !entry.allowed).length,
        logged: log.length,
        hosts: [...new Set(log.map((entry) => `${entry.allowed ? '+' : '-'}${entry.host}`))].join(','),
        canaryHits: counts.sandbox ?? 0,
        canaryControl: counts.control ?? 0,
        controlStatus: control,
        leakStatus: String(Reflect.get(Object(parsed), 'leak')),
        sandboxBindings: String(Reflect.get(Object(parsed), 'bindings') ?? 'unknown'),
      },
    };
  },
}) {
  async rememberHost(host: string) {
    await this.ctx.storage.put('host', host);
  }
}

const router = piRouter<Env>({
  shape: 'egress-filter',
  agent: (env, name) => env.WORKSPACE.get(env.WORKSPACE.idFromName(name)),
  gateway: (env) => env.GATEWAY,
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === CANARY_PATH) {
      await canary(env).hit(url.searchParams.get('from') === 'control' ? 'control' : 'sandbox');
      return new Response('canary noted');
    }
    const agent = url.searchParams.get('agent');
    if (agent !== null && /^[a-z0-9-]{1,64}$/.test(agent))
      await env.WORKSPACE.get(env.WORKSPACE.idFromName(agent)).rememberHost(url.host);
    return router.fetch?.(request, env, ctx) ?? new Response('not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
