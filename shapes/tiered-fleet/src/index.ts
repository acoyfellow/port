import { DurableObject } from 'cloudflare:workers';
import type { Context } from '@earendil-works/chord/context';
import type {
  ExecutionError,
  Result,
  ShellExecOptions,
  ShellExecResult,
} from '@earendil-works/pi-durable/env';
import { type AgentEnv, piAgent } from '../../kit/agent.ts';
import { RemoteHttpEnv } from '../../kit/http-env.ts';
import { nodeTestCommand, type WorkerLoader } from '../../kit/loader-tests.ts';
import { type FileStore, MemoryExecutionEnv, sqliteFileStore } from '../../kit/memory-env.ts';
import { piRouter } from '../../kit/router.ts';
import { classifyCommand, createTierTracker, type TieredStats } from './tiered-core.ts';

type Env = AgentEnv & {
  readonly AGENT: DurableObjectNamespace<Agent>;
  readonly TRACKER: DurableObjectNamespace<Tracker>;
  readonly VESSEL: DurableObjectNamespace<Vessel>;
  readonly LOADER: WorkerLoader;
};

const WORKSPACE = '/workspace';
const SEED = 'seed';
const BOX_PORT = 8080;
const BOOT_TRIES = 90;
const TRACKER_NAME = 'fleet';

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

export class Vessel extends DurableObject<Env> {
  async #port() {
    const container = this.ctx.container;
    if (container === undefined) throw new Error('tiered vessel has no container');
    if (!container.running) container.start({ enableInternet: true });
    const port = container.getTcpPort(BOX_PORT);
    for (let attempt = 0; attempt < BOOT_TRIES; attempt++) {
      const reply = await port.fetch('http://box/').catch(() => undefined);
      if (reply?.ok === true) return port;
      await pause(1000);
    }
    throw new Error('tiered vessel never answered');
  }

  async relay(path: string, method: string, body: string) {
    const response = await (await this.#port()).fetch(`http://box${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(method === 'GET' ? {} : { body }),
    });
    return { status: response.status, text: await response.text() };
  }
}

export class Tracker extends DurableObject<Env> {
  #tracker = createTierTracker();

  recordCommand(seat: string, command: string) {
    return this.#tracker.recordCommand(seat, command);
  }

  recordLease(seat: string, elapsedMs: number) {
    this.#tracker.recordContainerLease(seat, elapsedMs);
  }

  stats(): TieredStats {
    return this.#tracker.stats();
  }
}

class TieredExecutionEnv extends MemoryExecutionEnv {
  readonly #env: Env;
  readonly #seatId: string;
  readonly #store: FileStore;
  readonly #containerCwd: string;
  readonly #container: RemoteHttpEnv;

  constructor(env: Env, seatId: string, store: FileStore) {
    super({
      id: `tiered-fleet:${seatId}`,
      cwd: WORKSPACE,
      store,
      commands: [nodeTestCommand(env.LOADER, WORKSPACE)],
    });
    this.#env = env;
    this.#seatId = seatId;
    this.#store = store;
    this.#containerCwd = `${WORKSPACE}/${seatId}`;
    this.#container = new RemoteHttpEnv({
      id: `tiered-box:${seatId}`,
      cwd: this.#containerCwd,
      transport: async (path, init) => {
        const box = env.VESSEL.get(env.VESSEL.idFromName('vessel-1'));
        const body = typeof init.body === 'string' ? init.body : '';
        const reply = await box.relay(path, init.method ?? 'GET', body);
        return new Response(reply.text, { status: reply.status });
      },
    });
  }

  async #syncToContainer(context: Context) {
    const decoder = new TextDecoder();
    for (const [path, bytes] of Object.entries(this.#store.load())) {
      if (!path.startsWith(`${WORKSPACE}/`)) continue;
      const rel = path.slice(WORKSPACE.length + 1);
      await this.#container.writeFile(`${this.#containerCwd}/${rel}`, decoder.decode(bytes), context);
    }
  }

  override async exec(
    command: string | readonly string[],
    options: ShellExecOptions | undefined,
    context: Context,
  ): Promise<Result<ShellExecResult, ExecutionError>> {
    const text = typeof command === 'string' ? command : command.join(' ');
    const tracker = this.#env.TRACKER.get(this.#env.TRACKER.idFromName(TRACKER_NAME));
    const decision = classifyCommand(text);
    await tracker.recordCommand(this.#seatId, text);
    if (decision.tier === 'isolate') return super.exec(command, options, context);
    const started = Date.now();
    await this.#syncToContainer(context);
    const result = await this.#container.exec(command, options, context);
    await tracker.recordLease(this.#seatId, Math.max(1, Date.now() - started));
    return result;
  }
}

export class Agent extends piAgent<Env>({
  name: 'tiered-fleet',
  instructions:
    'You are a careful TypeScript engineer working in /workspace. Make the change the task asks for, add tests in test/, and run `node --test` (which runs fast in a Worker Loader isolate). Use Linux tools only if truly needed. Reply with a one-line summary when tests pass.',
  environment: (env, ctx) =>
    new TieredExecutionEnv(env, ctx.id.toString(), sqliteFileStore(ctx.storage.sql, SEED)),
}) {}

export default piRouter<Env>({
  shape: 'tiered-fleet',
  agent: (env, name) => env.AGENT.get(env.AGENT.idFromName(name)),
  gateway: (env) => env.GATEWAY,
  extra: async (request, env) => {
    const url = new URL(request.url);
    if (url.pathname === '/fleet/metrics') {
      const tracker = env.TRACKER.get(env.TRACKER.idFromName(TRACKER_NAME));
      return Response.json(await tracker.stats());
    }
    return undefined;
  },
});
