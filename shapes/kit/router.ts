import type { Answer, Probe } from './agent.ts';

export type RoutedAgent = {
  submit(input: string, requestId: string, model?: string): Promise<string>;
  status(requestId: string, input: string): Promise<Answer | { readonly status: 'running' }>;
  restart(): Promise<void>;
  workspace(): Promise<Record<string, string>>;
  writeWorkspace?(files: Record<string, string>): Promise<boolean>;
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

const NAME = /^[a-z0-9-]{1,64}$/;

export const INSTALL_KEY_HEADER = 'x-port-key';

const installKeyOf = (env: unknown) => {
  const value = typeof env === 'object' && env !== null ? Reflect.get(env, 'PORT_KEY') : undefined;
  return typeof value === 'string' ? value : undefined;
};

export const piRouter = <Env>(options: RouterOptions<Env>): ExportedHandler<Env> => ({
  async fetch(request, env) {
    const key = options.key?.(env) ?? installKeyOf(env);
    if (
      key !== undefined &&
      key !== '' &&
      request.headers.get(INSTALL_KEY_HEADER) !== key &&
      request.headers.get('authorization') !== `Bearer ${key}`
    )
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
        const files = filesField(body);
        if (files === 'invalid') return json({ error: 'files must map relative paths to strings' }, 400);
        if (files !== undefined && !(await agent.writeWorkspace?.(files)))
          return json({ error: 'files not supported' }, 400);
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
