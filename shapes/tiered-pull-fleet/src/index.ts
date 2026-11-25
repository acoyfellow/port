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
import {
  classifyIsolateCommand,
  createTieredPullCoordinator,
  type TieredPullMetrics,
} from './tiered-pull-core.ts';

type Env = AgentEnv & {
  readonly COORDINATOR: DurableObjectNamespace<Coordinator>;
  readonly SEAT: DurableObjectNamespace<Seat>;
  readonly VESSEL: DurableObjectNamespace<Vessel>;
  readonly LOADER: WorkerLoader;
};

type TaskPayload = {
  readonly prompt: string;
  readonly files?: Record<string, string>;
  readonly model?: string;
};

const CONCURRENCY = 3;
const MAX_BUDGET_USD = 5;
const WORST_CASE_PER_SEAT_USD = 0.25;
const WORKSPACE = '/workspace';
const SEED = 'seed';
const BOX_PORT = 8080;
const BOOT_TRIES = 90;
const FLEET_NAME = 'fleet';
const NAME = /^[a-z0-9-]{1,64}$/;

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));
const json = (body: unknown, status = 200) => Response.json(body, { status });

const isTaskPayload = (value: unknown): value is TaskPayload => {
  if (typeof value !== 'object' || value === null) return false;
  return typeof Reflect.get(value, 'prompt') === 'string';
};

export class Vessel extends DurableObject<Env> {
  async #port() {
    const container = this.ctx.container;
    if (container === undefined) throw new Error('tiered-pull vessel has no container');
    if (!container.running) container.start({ enableInternet: true });
    const port = container.getTcpPort(BOX_PORT);
    for (let attempt = 0; attempt < BOOT_TRIES; attempt++) {
      const reply = await port.fetch('http://box/').catch(() => undefined);
      if (reply?.ok === true) return port;
      await pause(1000);
    }
    throw new Error('tiered-pull vessel never answered');
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

export class Coordinator extends DurableObject<Env> {
  #state = createTieredPullCoordinator({
    concurrency: CONCURRENCY,
    maxBudgetUsd: MAX_BUDGET_USD,
    worstCasePerSeatUsd: WORST_CASE_PER_SEAT_USD,
  });

  async submit(agent: string, payload: TaskPayload, weight = 0) {
    const result = this.#state.submit({ agent, weight, payload, nowMs: Date.now() });
    if (result.ok && result.status === 'assigned') {
      const seat = this.env.SEAT.get(this.env.SEAT.idFromName(result.assignment.agent));
      await seat.startAssigned(result.assignment.agent, result.assignment.slot, payload);
    }
    return result;
  }

  recordCommand(agent: string, command: string) {
    return this.#state.recordIsolateCommand(agent, command);
  }

  recordLease(agent: string, elapsedMs: number) {
    this.#state.recordContainerLease(agent, elapsedMs);
  }

  async complete(agent: string, usd: number) {
    const result = this.#state.complete(agent, usd, Date.now());
    if (result.ok && result.next !== null && isTaskPayload(result.next.payload)) {
      const seat = this.env.SEAT.get(this.env.SEAT.idFromName(result.next.agent));
      await seat.startAssigned(result.next.agent, result.next.slot, result.next.payload);
    }
    return result;
  }

  assignmentOf(agent: string) {
    return this.#state.assignmentOf(agent);
  }

  metrics(): TieredPullMetrics {
    return this.#state.metrics();
  }
}

class TieredPullExecutionEnv extends MemoryExecutionEnv {
  readonly #env: Env;
  readonly #seatId: string;
  readonly #store: FileStore;
  readonly #containerCwd: string;
  readonly #container: RemoteHttpEnv;
  readonly #synced = new Map<string, string>();

  constructor(env: Env, seatId: string, store: FileStore) {
    super({
      id: `tiered-pull:${seatId}`,
      cwd: WORKSPACE,
      store,
      commands: [nodeTestCommand(env.LOADER, WORKSPACE)],
    });
    this.#env = env;
    this.#seatId = seatId;
    this.#store = store;
    this.#containerCwd = `${WORKSPACE}/${seatId}`;
    this.#container = new RemoteHttpEnv({
      id: `tiered-pull-box:${seatId}`,
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
    const writes: Promise<unknown>[] = [];
    for (const [path, bytes] of Object.entries(this.#store.load())) {
      if (!path.startsWith(`${WORKSPACE}/`)) continue;
      const text = decoder.decode(bytes);
      if (this.#synced.get(path) === text) continue;
      this.#synced.set(path, text);
      const rel = path.slice(WORKSPACE.length + 1);
      writes.push(this.#container.writeFile(`${this.#containerCwd}/${rel}`, text, context));
    }
    await Promise.all(writes);
  }

  override async exec(
    command: string | readonly string[],
    options: ShellExecOptions | undefined,
    context: Context,
  ): Promise<Result<ShellExecResult, ExecutionError>> {
    const text = typeof command === 'string' ? command : command.join(' ');
    const coord = this.#env.COORDINATOR.get(this.#env.COORDINATOR.idFromName(FLEET_NAME));
    const decision = classifyIsolateCommand(text);
    await coord.recordCommand(this.#seatId, text);
    if (decision.tier === 'isolate') return super.exec(command, options, context);
    const started = Date.now();
    await this.#syncToContainer(context);
    const result = await this.#container.exec(command, options, context);
    await coord.recordLease(this.#seatId, Math.max(1, Date.now() - started));
    return result;
  }
}

export class Seat extends piAgent<Env>({
  name: 'tiered-pull-fleet',
  instructions:
    'You are a careful TypeScript engineer working in /workspace. Make the requested change, add tests in test/, and run tests with `node --test` (runs fast in a Worker Loader isolate with no container startup; do not use `npx` or `node -e` for TypeScript checks). Use Linux binaries like python3 or git only when the task explicitly asks for them. Reply with one short sentence when done.',
  environment: (env, ctx) =>
    new TieredPullExecutionEnv(env, ctx.id.toString(), sqliteFileStore(ctx.storage.sql, SEED)),
}) {
  async startAssigned(agentName: string, slot: string, payload: TaskPayload) {
    await this.ctx.storage.put('assigned-slot', slot);
    await this.ctx.storage.put('assigned-name', agentName);
    await this.ctx.storage.put('assigned-notified', false);
    if (payload.files !== undefined) await this.writeWorkspace(payload.files);
    return this.submit(payload.prompt, `run:${agentName}`, payload.model);
  }

  async pollStatus(requestId: string) {
    const reply = await this.status(requestId, '');
    if (reply.status !== 'running') {
      const notified = await this.ctx.storage.get<boolean>('assigned-notified');
      if (notified !== true) {
        await this.ctx.storage.put('assigned-notified', true);
        const name = await this.ctx.storage.get<string>('assigned-name');
        if (name !== undefined) {
          const coord = this.env.COORDINATOR.get(this.env.COORDINATOR.idFromName(FLEET_NAME));
          await coord.complete(name, reply.usd);
        }
      }
    }
    return reply;
  }
}

const filesField = (value: unknown): Record<string, string> | undefined | 'invalid' => {
  const found = typeof value === 'object' && value !== null ? Reflect.get(value, 'files') : undefined;
  if (found === undefined) return undefined;
  if (typeof found !== 'object' || found === null) return 'invalid';
  const files: Record<string, string> = {};
  for (const [path, text] of Object.entries(found)) {
    if (typeof text !== 'string' || path.startsWith('/') || path.split('/').includes('..')) return 'invalid';
    files[path] = text;
  }
  return files;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health')
      return json({
        ok: true,
        shape: 'tiered-pull-fleet',
        agent: 'pi-durable',
        gateway: env.GATEWAY,
        concurrency: CONCURRENCY,
      });
    const coordinator = env.COORDINATOR.get(env.COORDINATOR.idFromName(FLEET_NAME));
    if (url.pathname === '/fleet/metrics') return json(await coordinator.metrics());
    const name = url.searchParams.get('agent') ?? '';
    if (!NAME.test(name)) return json({ error: 'agent must match [a-z0-9-]{1,64}' }, 400);
    if ((url.pathname === '/fleet/submit' || url.pathname === '/run') && request.method === 'POST') {
      const body: unknown = await request.json();
      const prompt = typeof body === 'object' && body !== null ? Reflect.get(body, 'prompt') : undefined;
      if (typeof prompt !== 'string') return json({ error: 'prompt is required' }, 400);
      const files = filesField(body);
      if (files === 'invalid') return json({ error: 'invalid files' }, 400);
      const modelValue = typeof body === 'object' && body !== null ? Reflect.get(body, 'model') : undefined;
      const weightValue = typeof body === 'object' && body !== null ? Reflect.get(body, 'weight') : undefined;
      const payload: TaskPayload = {
        prompt,
        ...(files === undefined ? {} : { files }),
        ...(typeof modelValue === 'string' ? { model: modelValue } : {}),
      };
      const weight = typeof weightValue === 'number' && Number.isFinite(weightValue) ? weightValue : 0;
      const result = await coordinator.submit(name, payload, weight);
      if (!result.ok) return json(result, result.reason === 'budget-limit' ? 402 : 409);
      return json(result);
    }
    if (url.pathname === '/status') {
      const assignment = await coordinator.assignmentOf(name);
      if (assignment.state === 'queued') return json({ status: 'running', queued: true, usd: 0, tokens: 0 });
      const seat = env.SEAT.get(env.SEAT.idFromName(name));
      return json(await seat.pollStatus(`run:${name}`));
    }
    if (url.pathname === '/files') {
      const seat = env.SEAT.get(env.SEAT.idFromName(name));
      return json(await seat.workspace());
    }
    return json({ error: 'not found' }, 404);
  },
} satisfies ExportedHandler<Env>;
