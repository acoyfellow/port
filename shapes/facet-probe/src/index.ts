import { DurableObject } from 'cloudflare:workers';
import { type AgentEnv, type Answer, type Probe, piAgent, type RunningAnswer } from '../../kit/agent.ts';
import { MemoryExecutionEnv, sqliteFileStore } from '../../kit/memory-env.ts';
import { piRouter, type RoutedAgent } from '../../kit/router.ts';

type Env = AgentEnv & { readonly HOST: DurableObjectNamespace<Host> };

const ROOT = '/workspace';
const AGENT = 'agent';
const PARENT_WAKE_MS = 10_000;

export class Agent extends piAgent<Env>({
  name: 'facet-probe',
  wakeBy: 'parent',
  instructions: `You are a Pi coding agent. Your workspace is ${ROOT}. Do the task with the tools, check it, then reply in one short sentence.`,
  environment: (_env, ctx) =>
    new MemoryExecutionEnv({
      id: `facet-probe:${ctx.id.toString()}`,
      cwd: ROOT,
      store: sqliteFileStore(ctx.storage.sql, 'workspace'),
    }),
}) {}

export class Host extends DurableObject<Env> {
  #facet(name: string) {
    const exported: DurableObjectClass<Agent> | undefined = Reflect.get(this.ctx.exports, 'Agent');
    if (exported === undefined) throw new Error('ctx.exports has no Agent class');
    return this.ctx.facets.get<Agent>(name, () => ({ class: exported }));
  }

  async submit(prompt: string, requestId: string) {
    const request = await this.#facet(AGENT).submit(prompt, requestId);
    await this.ctx.storage.setAlarm(Date.now() + PARENT_WAKE_MS);
    return request;
  }

  override async alarm() {
    const wake = await this.#facet(AGENT).wake();
    const wakes = Number((await this.ctx.storage.get<number>('wakes')) ?? 0) + 1;
    await this.ctx.storage.put('wakes', wakes);
    if (wake.active || wake.at !== undefined) await this.ctx.storage.setAlarm(Date.now() + PARENT_WAKE_MS);
  }

  async status(requestId: string, name = AGENT): Promise<Answer | RunningAnswer> {
    return structuredClone(await this.#facet(name).status(requestId, ''));
  }

  async workspace(name = AGENT): Promise<Record<string, string>> {
    return structuredClone(await this.#facet(name).workspace());
  }

  async probe(): Promise<Probe> {
    const id = this.ctx.id.toString();
    const wakes = Number((await this.ctx.storage.get<number>('wakes')) ?? 0);
    return { facts: { host: id, facet: AGENT, parentWakes: wakes } };
  }

  async abortAgent() {
    this.ctx.facets.abort(AGENT, new Error('abort on purpose'));
    return { aborted: true, at: Date.now() };
  }

  async clone(to: string): Promise<Record<string, string>> {
    this.ctx.facets.clone(AGENT, to);
    return this.workspace(to);
  }
}

const host = (env: Env, url: URL) =>
  env.HOST.get(env.HOST.idFromName(url.searchParams.get('host') ?? 'probe'));
const json = (body: unknown) => Response.json(body);

export default piRouter<Env>({
  shape: 'facet-probe',
  agent: (env, name): RoutedAgent => {
    const stub = env.HOST.get(env.HOST.idFromName(name));
    return {
      submit: (input, requestId) => stub.submit(input, requestId),
      status: (requestId) => stub.status(requestId),
      restart: async () => {
        await stub.abortAgent();
      },
      workspace: () => stub.workspace(),
      probe: () => stub.probe(),
    };
  },
  gateway: (env) => env.GATEWAY,
  extra: async (request, env) => {
    const url = new URL(request.url);
    if (url.pathname === '/facet/abort') return json(await host(env, url).abortAgent());
    if (url.pathname === '/facet/clone')
      return json(await host(env, url).clone(url.searchParams.get('to') ?? 'fork'));
    if (url.pathname === '/facet/workspace')
      return json(await host(env, url).workspace(url.searchParams.get('name') ?? AGENT));
    return undefined;
  },
});
