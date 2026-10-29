import { FLEET } from '../shared/catalog';
import { SCOPES } from '../shared/scopes';
import { type AuthEnv, authRoute } from './auth/routes';
import type { GrantEnv } from './grant';
import { installRoute, receiptRoute } from './install-routes';

export { Grant } from './grant';

type Env = AuthEnv &
  GrantEnv & {
    readonly ASSETS: Fetcher;
  };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const auth = authRoute(env, request, url);

    if (auth !== null) return auth;

    const installs = await installRoute(env, request, url);

    if (installs !== null) return installs;

    const receipt = await receiptRoute(env, url);

    if (receipt !== null) return receipt;
    if (url.pathname === '/api/catalog') return json(FLEET);
    if (url.pathname === '/api/scopes') return json(SCOPES);

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
