import { CATALOG } from '../shared/catalog';
import { SCOPES } from '../shared/scopes';
import { type AuthEnv, authRoute } from './auth/routes';
import type { GrantEnv } from './grant';

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
    if (url.pathname === '/api/catalog') return json(CATALOG);
    if (url.pathname === '/api/scopes') return json(SCOPES);

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
