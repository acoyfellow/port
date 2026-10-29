import { CATALOG } from '../shared/catalog';
import { SCOPES } from '../shared/scopes';

type Env = {
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

    if (url.pathname === '/api/catalog') return json(CATALOG);
    if (url.pathname === '/api/scopes') return json(SCOPES);
    if (url.pathname === '/oauth/start')
      return json(
        {
          error: 'Sign in is not wired yet. The OAuth client is a dashboard step.',
        },
        501,
      );

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
