import type { Grant } from '../grant';
import {
  accountsOf,
  authorizeUrl,
  type CloudflareAccount,
  exchangeCode,
  type OAuthClient,
  OAuthFailed,
  randomToken,
  userInfo,
} from './oauth';
import {
  clearCookie,
  cookie,
  cookieJar,
  FLOW_TTL_MS,
  parseSession,
  readCookie,
  SESSION_TTL_MS,
  sessionValue,
  sign,
  unsign,
} from './session';

export type AuthEnv = {
  readonly GRANTS: DurableObjectNamespace<Grant>;
  readonly OAUTH_CLIENT_ID: string;
  readonly OAUTH_CLIENT_SECRET: string;
  readonly SESSION_SECRET: string;
};

type Flow = { readonly state: string; readonly verifier: string };

const clientFor = (env: AuthEnv, url: URL): OAuthClient => ({
  clientId: env.OAUTH_CLIENT_ID,
  clientSecret: env.OAUTH_CLIENT_SECRET,
  redirectUri: `${url.origin}/oauth/callback`,
});

const redirect = (location: string, cookies: readonly string[] = []) => {
  const headers = new Headers({ location });

  for (const value of cookies) headers.append('set-cookie', value);

  return new Response(null, { status: 302, headers });
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>${title} · port</title><style>body{font:14px/1.6 ui-sans-serif,system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1.5rem}button{font:inherit;padding:.5rem 1rem;border-radius:.375rem;border:1px solid #d4d4d4;background:transparent;cursor:pointer;width:100%;text-align:left;margin:.25rem 0}code{font-size:12px}</style></head><body>${body}</body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );

const escapeHtml = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const sameOrigin = (request: Request, url: URL) => request.headers.get('origin') === url.origin;

export const grantFor = (env: AuthEnv, user: string) => env.GRANTS.get(env.GRANTS.idFromName(user));

export const currentUser = async (env: AuthEnv, request: Request): Promise<string | null> => {
  const jar = cookieJar(request.url);
  const session = parseSession(await unsign(env.SESSION_SECRET, readCookie(request, jar.session)));

  return session?.owner ?? null;
};

const accountPicker = (accounts: readonly CloudflareAccount[]) =>
  page(
    'Pick an account',
    `<h1>Pick the account to install on</h1><p>port only acts on the account you pick here.</p><form method="post" action="/oauth/account">${accounts
      .map(
        (account) =>
          `<button name="account" value="${escapeHtml(`${account.id}|${account.name}`)}">${escapeHtml(account.name)}<br><code>${escapeHtml(account.id)}</code></button>`,
      )
      .join('')}</form>`,
  );

const start = async (env: AuthEnv, request: Request, url: URL) => {
  const jar = cookieJar(request.url);
  const flow: Flow = { state: randomToken(), verifier: randomToken(48) };
  const target = await authorizeUrl(clientFor(env, url), flow.state, flow.verifier);
  const sealed = await sign(env.SESSION_SECRET, JSON.stringify(flow));

  return redirect(target, [cookie(jar, jar.flow, sealed, FLOW_TTL_MS)]);
};

const readFlow = async (env: AuthEnv, request: Request): Promise<Flow | null> => {
  const jar = cookieJar(request.url);
  const raw = await unsign(env.SESSION_SECRET, readCookie(request, jar.flow));

  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);

    return typeof parsed === 'object' &&
      parsed !== null &&
      'state' in parsed &&
      'verifier' in parsed &&
      typeof parsed.state === 'string' &&
      typeof parsed.verifier === 'string'
      ? { state: parsed.state, verifier: parsed.verifier }
      : null;
  } catch {
    return null;
  }
};

const callback = async (env: AuthEnv, request: Request, url: URL) => {
  const jar = cookieJar(request.url);
  const flow = await readFlow(env, request);
  const denied = url.searchParams.get('error');

  if (denied !== null)
    return page(
      'Sign in stopped',
      `<h1>Sign in stopped</h1><p>${escapeHtml(url.searchParams.get('error_description') ?? denied)}</p><p><a href="/">Back</a></p>`,
      400,
    );

  const code = url.searchParams.get('code');

  if (flow === null || code === null || url.searchParams.get('state') !== flow.state)
    return page(
      'Sign in expired',
      '<h1>Sign in expired</h1><p><a href="/oauth/start">Try again</a></p>',
      400,
    );

  try {
    const client = clientFor(env, url);
    const tokens = await exchangeCode(client, code, flow.verifier);
    const person = await userInfo(tokens.accessToken);
    const accounts = await accountsOf(tokens.accessToken);
    const only = accounts.length === 1 ? accounts[0] : undefined;
    const user = `cf:${person.sub}`;

    await grantFor(env, user).save({
      user,
      email: person.email,
      accountId: only?.id ?? null,
      accountName: only?.name ?? null,
      scope: tokens.scope,
      tokens,
      lastUsed: Date.now(),
    });

    const session = await sign(
      env.SESSION_SECRET,
      sessionValue({ owner: user, expires: Date.now() + SESSION_TTL_MS, id: randomToken(16) }),
    );
    const cookies = [cookie(jar, jar.session, session, SESSION_TTL_MS), clearCookie(jar, jar.flow)];

    if (accounts.length === 0)
      return page(
        'No account',
        '<h1>No account was shared</h1><p>Sign in again and tick an account on the consent screen.</p>',
        400,
      );

    return redirect(only === undefined ? '/oauth/account' : '/', cookies);
  } catch (error) {
    const message = error instanceof OAuthFailed ? error.message : 'Sign in failed.';

    return page('Sign in failed', `<h1>Sign in failed</h1><p>${escapeHtml(message)}</p>`, 502);
  }
};

const showAccounts = async (env: AuthEnv, request: Request, url: URL) => {
  const user = await currentUser(env, request);

  if (user === null) return redirect('/oauth/start');

  const token = await grantFor(env, user).token(`${url.origin}/oauth/callback`);

  if (token === null) return redirect('/oauth/start');

  return accountPicker(await accountsOf(token.accessToken));
};

const pickAccount = async (env: AuthEnv, request: Request, url: URL) => {
  if (!sameOrigin(request, url)) return json({ error: 'Cross-site request refused.' }, 403);

  const user = await currentUser(env, request);

  if (user === null) return redirect('/oauth/start');

  const grant = grantFor(env, user);
  const token = await grant.token(`${url.origin}/oauth/callback`);

  if (token === null) return redirect('/oauth/start');

  const picked = String((await request.formData()).get('account') ?? '');
  const [id] = picked.split('|');
  const account = (await accountsOf(token.accessToken)).find((each) => each.id === id);

  if (account === undefined) return accountPicker(await accountsOf(token.accessToken));

  await grant.chooseAccount(account.id, account.name);

  return redirect('/');
};

const me = async (env: AuthEnv, request: Request) => {
  const user = await currentUser(env, request);

  if (user === null) return json({ signedIn: false });

  const summary = await grantFor(env, user).summary();

  return summary === null
    ? json({ signedIn: false })
    : json({
        signedIn: true,
        email: summary.email,
        account: summary.accountId === null ? null : { id: summary.accountId, name: summary.accountName },
        scopes: summary.scope.split(' ').filter(Boolean),
      });
};

const logout = async (env: AuthEnv, request: Request, url: URL) => {
  if (!sameOrigin(request, url)) return json({ error: 'Cross-site request refused.' }, 403);

  const jar = cookieJar(request.url);
  const user = await currentUser(env, request);

  if (user !== null) await grantFor(env, user).signOut(`${url.origin}/oauth/callback`);

  return redirect('/', [clearCookie(jar, jar.session)]);
};

export const authRoute = (env: AuthEnv, request: Request, url: URL): Promise<Response> | null => {
  const route = `${request.method} ${url.pathname}`;

  if (route === 'GET /oauth/start') return start(env, request, url);
  if (route === 'GET /oauth/callback') return callback(env, request, url);
  if (route === 'GET /oauth/account') return showAccounts(env, request, url);
  if (route === 'POST /oauth/account') return pickAccount(env, request, url);
  if (route === 'GET /oauth/me') return me(env, request);
  if (route === 'POST /oauth/logout') return logout(env, request, url);

  return null;
};
