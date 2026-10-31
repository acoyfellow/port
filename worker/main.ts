import { FLEET } from '../shared/catalog';
import { ENTRIES } from '../shared/entries/index';
import { SCOPES } from '../shared/scopes';
import { type AuthEnv, authRoute, currentUser, grantFor, safeNext, viewerOf } from './auth/routes';
import type { GrantEnv } from './grant';
import { installRoute, receiptRoute } from './routes/installs';
import { accountPage, signInPage } from './ui/auth';
import { fleetPage, homePage } from './ui/directory';
import { sortOf } from './ui/directory-table';
import { entryPage } from './ui/entries';
import { errorPage, notFound } from './ui/parts';
import { previewRoute } from './ui/preview';

export { Grant } from './grant';

type Env = AuthEnv &
  GrantEnv & {
    readonly ASSETS: Fetcher;
    readonly PREVIEW?: string;
  };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

const pageRoute = async (env: Env, request: Request, url: URL): Promise<Response | null> => {
  if (request.method !== 'GET') return null;
  const user = await currentUser(env, request);
  const viewer = await viewerOf(env, user);

  if (url.pathname === '/') return homePage(viewer, sortOf(url.searchParams));
  if (url.pathname === '/fleet') return fleetPage(viewer);
  const entry = ENTRIES.find((each) => url.pathname === `/d/${each.slug}`);
  if (entry !== undefined) return entryPage(viewer, entry);
  if (url.pathname === '/sign-in')
    return viewer === null
      ? signInPage(safeNext(url.searchParams.get('next')))
      : Response.redirect(`${url.origin}${safeNext(url.searchParams.get('next'))}`, 302);
  if (url.pathname === '/account') {
    if (user === null || viewer === null)
      return Response.redirect(`${url.origin}/sign-in?next=/account`, 302);
    const summary = await grantFor(env, user).summary();
    return accountPage(viewer, {
      email: summary?.email ?? null,
      accountName: summary?.accountName ?? null,
      accountId: summary?.accountId ?? null,
      scopes: (summary?.scope ?? '').split(' ').filter(Boolean),
    });
  }
  return null;
};

const route = async (env: Env, request: Request, url: URL): Promise<Response> => {
  const preview = previewRoute(env.PREVIEW === 'on', url);
  if (preview !== null) return preview;

  const auth = authRoute(env, request, url);
  if (auth !== null) return auth;

  const installs = await installRoute(env, request, url);
  if (installs !== null) return installs;

  const receipt = await receiptRoute(env, url);
  if (receipt !== null) return receipt;

  if (url.pathname === '/api/catalog') return json(FLEET);
  if (url.pathname === '/api/scopes') return json(SCOPES);

  const page = await pageRoute(env, request, url);
  if (page !== null) return page;

  const asset = await env.ASSETS.fetch(request);
  if (asset.status !== 404) return asset;

  return notFound(await viewerOf(env, await currentUser(env, request)));
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      return await route(env, request, url);
    } catch (error) {
      console.error(error);
      return errorPage({
        status: 500,
        title: 'Something broke',
        detail: 'port hit an error it did not expect. Nothing on your account changed because of this page.',
        viewer: null,
      });
    }
  },
} satisfies ExportedHandler<Env>;
