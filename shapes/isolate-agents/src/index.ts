import { type AgentEnv, piAgent } from '../../kit/agent.ts';
import { nodeTestCommand, runInIsolate, type WorkerLoader } from '../../kit/loader-tests.ts';
import { MemoryExecutionEnv, sqliteFileStore } from '../../kit/memory-env.ts';

const WORKSPACE = '/workspace';
const SEED = 'seed';

type Env = AgentEnv & {
  readonly AGENT: DurableObjectNamespace<Agent>;
  readonly LOADER: WorkerLoader;
  readonly FLEET_KEY: string;
};

export class Agent extends piAgent<Env>({
  name: 'isolate-agents',
  instructions:
    'You are a careful TypeScript engineer working in /workspace. Make the change the task asks for, add tests for it in the test folder, and keep every existing test passing. Run the tests with `node --test`; they run in a fresh Worker Loader isolate with no network. When the tests pass and the task is done, reply with a one-line summary.',
  environment: (env, ctx) =>
    new MemoryExecutionEnv({
      id: `isolate-agents:${ctx.id.toString()}`,
      cwd: WORKSPACE,
      store: sqliteFileStore(ctx.storage.sql, SEED),
      commands: [nodeTestCommand(env.LOADER, WORKSPACE)],
    }),
}) {
  seed(files: Record<string, string>) {
    const store = sqliteFileStore(this.ctx.storage.sql, SEED);
    if (Object.keys(store.load()).length > 0) return;
    for (const [path, text] of Object.entries(files))
      store.save(`${WORKSPACE}/${path}`, new TextEncoder().encode(text));
  }

  files() {
    const decoder = new TextDecoder();
    return Object.fromEntries(
      Object.entries(sqliteFileStore(this.ctx.storage.sql, SEED).load())
        .filter(([path]) => path.startsWith(`${WORKSPACE}/`))
        .map(([path, bytes]) => [path.slice(WORKSPACE.length + 1), decoder.decode(bytes)]),
    );
  }
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

const runOf = (value: unknown) => {
  if (typeof value !== 'object' || value === null) return undefined;
  const prompt = Reflect.get(value, 'prompt');
  const files = Reflect.get(value, 'files');
  const model = Reflect.get(value, 'model');
  if (typeof prompt !== 'string' || typeof files !== 'object' || files === null) return undefined;
  const entries = Object.entries(files).filter(
    (pair): pair is [string, string] => typeof pair[1] === 'string',
  );
  return { prompt, files: Object.fromEntries(entries), model: typeof model === 'string' ? model : undefined };
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${env.FLEET_KEY}`)
      return json({ error: 'unauthorized' }, 401);
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true, gateway: env.GATEWAY, agent: 'pi-durable' });
    if (url.pathname === '/selftest' && request.method === 'POST') {
      const body: { files: Record<string, string>; tests: string[] } = await request.json();
      return json(await runInIsolate(env.LOADER, body.files, body.tests));
    }
    const id = url.searchParams.get('agent') ?? '';
    if (id === '') return json({ error: 'agent is required' }, 400);
    const agent = env.AGENT.get(env.AGENT.idFromName(id));
    const requestId = `run:${id}`;
    if (url.pathname === '/run' && request.method === 'POST') {
      const run = runOf(await request.json());
      if (run === undefined) return json({ error: 'prompt and files are required' }, 400);
      await agent.seed(run.files);
      return json({ request: await agent.submit(run.prompt, requestId, run.model) });
    }
    if (url.pathname === '/status') return json(await agent.status(requestId, ''));
    if (url.pathname === '/files') return json(await agent.files());
    if (url.pathname === '/restart') {
      await agent.restart().catch(() => undefined);
      return json({ restarted: true });
    }
    return json({ error: 'not found' }, 404);
  },
} satisfies ExportedHandler<Env>;
