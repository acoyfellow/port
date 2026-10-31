import type { Answer, Probe } from './agent.ts';

export type RoutedAgent = {
  submit(input: string, requestId: string, model?: string): Promise<string>;
  status(requestId: string, input: string): Promise<Answer | { readonly status: 'running' }>;
  restart(): Promise<void>;
  workspace(): Promise<Record<string, string>>;
  probe(): Promise<Probe>;
};

export type RouterOptions<Env> = {
  readonly shape: string;
  readonly agent: (env: Env, name: string) => RoutedAgent;
  readonly key?: (env: Env) => string;
  readonly gateway: (env: Env) => string;
  readonly identify?: (request: Request, env: Env) => Promise<string | null>;
  readonly extra?: (request: Request, env: Env) => Promise<Response | undefined>;
};

const json = (body: unknown, status = 200) => Response.json(body, { status });

const stringField = (value: unknown, key: string) => {
  const found = typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
  return typeof found === 'string' ? found : undefined;
};

const NAME = /^[a-z0-9-]{1,64}$/;

export const piRouter = <Env>(options: RouterOptions<Env>): ExportedHandler<Env> => ({
  async fetch(request, env) {
    const key = options.key?.(env);
    if (key !== undefined && request.headers.get('authorization') !== `Bearer ${key}`)
      return json({ error: 'unauthorized' }, 401);
    const url = new URL(request.url);
    if (url.pathname === '/health')
      return json({ ok: true, shape: options.shape, agent: 'pi-durable', gateway: options.gateway(env) });
    const extra = await options.extra?.(request, env);
    if (extra !== undefined) return extra;
    const identified =
      options.identify === undefined ? url.searchParams.get('agent') : await options.identify(request, env);
    if (identified === null) return json({ error: 'not signed in' }, 401);
    const name = identified ?? '';
    if (!NAME.test(name)) return json({ error: 'agent must match [a-z0-9-]{1,64}' }, 400);
    const agent = options.agent(env, name);
    const requestId = `run:${name}`;
    try {
      if (url.pathname === '/run' && request.method === 'POST') {
        const body: unknown = await request.json();
        const prompt = stringField(body, 'prompt');
        if (prompt === undefined) return json({ error: 'prompt is required' }, 400);
        return json({ request: await agent.submit(prompt, requestId, stringField(body, 'model')) });
      }
      if (url.pathname === '/status') return json(await agent.status(requestId, ''));
      if (url.pathname === '/files') return json(await agent.workspace());
      if (url.pathname === '/probe') return json((await agent.probe()).facts);
      if (url.pathname === '/restart') {
        await agent.restart().catch(() => undefined);
        return json({ restarted: true });
      }
    } catch (error) {
      return json({ error: String(error) }, 502);
    }
    return json({ error: 'not found' }, 404);
  },
});
