import type { Grant } from '../grant';
import { accountPickerPage, linkPage as linkView, signInError } from '../ui/auth';
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
  readonly CLI_KEY_SECRET: string;
  readonly RECEIPTS: KVNamespace;
};

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

const sameOrigin = (request: Request, url: URL) => request.headers.get('origin') === url.origin;

export const grantFor = (env: AuthEnv, user: string) => env.GRANTS.get(env.GRANTS.idFromName(user));

const CLI_KEY_PREFIX = 'portcli.';

const CLI_KEY_TTL_MS = 24 * 60 * 60 * 1000;

const bearer = (request: Request) => {
  const header = request.headers.get('authorization') ?? '';
  return header.startsWith(`Bearer ${CLI_KEY_PREFIX}`)
    ? header.slice(`Bearer ${CLI_KEY_PREFIX}`.length)
    : null;
};

export const usesCliKey = (request: Request) => bearer(request) !== null;

type SessionSecrets = Pick<AuthEnv, 'SESSION_SECRET' | 'CLI_KEY_SECRET'>;

export const mintCliKey = async (env: SessionSecrets, owner: string) =>
  `${CLI_KEY_PREFIX}${await sign(
    env.CLI_KEY_SECRET,
    sessionValue({ owner, expires: Date.now() + CLI_KEY_TTL_MS, id: randomToken(16) }),
  )}`;

export const currentUser = async (env: SessionSecrets, request: Request): Promise<string | null> => {
  const key = bearer(request);
  if (key !== null) return parseSession(await unsign(env.CLI_KEY_SECRET, key))?.owner ?? null;

  const jar = cookieJar(request.url);
  const session = parseSession(await unsign(env.SESSION_SECRET, readCookie(request, jar.session)));

  return session?.owner ?? null;
};

const accountPicker = async (env: AuthEnv, user: string, accounts: readonly CloudflareAccount[]) =>
  accountPickerPage(await viewerOf(env, user), accounts);

const FLOW_STATE_TTL_MS = 10 * 60 * 1000;

const isLocalPath = (value: string) =>
  value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/oauth/');

export const safeNext = (value: string | null) => (value !== null && isLocalPath(value) ? value : '/');

const newFlowUrl = async (env: AuthEnv, url: URL) => {
  const verifier = randomToken(48);
  const next = safeNext(url.searchParams.get('next'));
  const state = await sign(
    env.SESSION_SECRET,
    JSON.stringify({ verifier, next, expires: Date.now() + FLOW_STATE_TTL_MS, nonce: randomToken(8) }),
  );

  return authorizeUrl(clientFor(env, url), state, verifier);
};

const start = async (env: AuthEnv, url: URL) => redirect(await newFlowUrl(env, url));

const linkPage = async (env: AuthEnv, url: URL) => linkView(await newFlowUrl(env, url));

type Flow = { readonly verifier: string; readonly next: string };

const readFlow = async (env: AuthEnv, state: string | null): Promise<Flow | null> => {
  const raw = await unsign(env.SESSION_SECRET, state);

  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);

    return typeof parsed === 'object' &&
      parsed !== null &&
      'verifier' in parsed &&
      'expires' in parsed &&
      typeof parsed.verifier === 'string' &&
      typeof parsed.expires === 'number' &&
      parsed.expires > Date.now()
      ? {
          verifier: parsed.verifier,
          next: safeNext('next' in parsed && typeof parsed.next === 'string' ? parsed.next : null),
        }
      : null;
  } catch {
    return null;
  }
};

const callback = async (env: AuthEnv, request: Request, url: URL) => {
  const jar = cookieJar(request.url);
  const flow = await readFlow(env, url.searchParams.get('state'));
  const denied = url.searchParams.get('error');

  if (denied !== null)
    return signInError(
      400,
      'Sign in stopped',
      `${url.searchParams.get('error_description') ?? denied}. If this mentions a CSRF value, your network opened the sign-in in two browsers: use a sign-in link and open it in a new tab.`,
    );

  const code = url.searchParams.get('code');

  if (flow === null || code === null)
    return signInError(
      400,
      'Sign in expired',
      'The sign-in took longer than 10 minutes, or it was opened twice.',
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
    const cookies = [cookie(jar, jar.session, session, SESSION_TTL_MS)];

    if (accounts.length === 0)
      return signInError(
        400,
        'No account was shared',
        'Sign in again and tick an account on the consent screen.',
      );

    return redirect(
      only === undefined ? `/oauth/account?next=${encodeURIComponent(flow.next)}` : flow.next,
      cookies,
    );
  } catch (error) {
    const message = error instanceof OAuthFailed ? error.message : 'Sign in failed.';

    return signInError(502, 'Sign in failed', message);
  }
};

const showAccounts = async (env: AuthEnv, request: Request, url: URL) => {
  const user = await currentUser(env, request);

  if (user === null) return redirect('/sign-in?next=/oauth/account');

  const token = await grantFor(env, user).token(`${url.origin}/oauth/callback`);

  if (token === null) return redirect('/sign-in');

  return accountPicker(env, user, await accountsOf(token.accessToken));
};

const pickAccount = async (env: AuthEnv, request: Request, url: URL) => {
  if (!sameOrigin(request, url)) return json({ error: 'Cross-site request refused.' }, 403);

  const user = await currentUser(env, request);

  if (user === null) return redirect('/sign-in');

  const grant = grantFor(env, user);
  const token = await grant.token(`${url.origin}/oauth/callback`);

  if (token === null) return redirect('/sign-in');

  const picked = String((await request.formData()).get('account') ?? '');
  const [id] = picked.split('|');
  const account = (await accountsOf(token.accessToken)).find((each) => each.id === id);

  if (account === undefined) return accountPicker(env, user, await accountsOf(token.accessToken));

  await grant.chooseAccount(account.id, account.name);

  return redirect('/installs');
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

export const viewerOf = async (env: AuthEnv, user: string | null) => {
  if (user === null) return null;
  const summary = await grantFor(env, user).summary();
  return summary === null ? null : { email: summary.email, accountName: summary.accountName };
};

export const authRoute = (env: AuthEnv, request: Request, url: URL): Promise<Response> | null => {
  const route = `${request.method} ${url.pathname}`;

  if (route === 'GET /oauth/start') return start(env, url);
  if (route === 'GET /oauth/link') return linkPage(env, url);
  if (route === 'GET /oauth/callback') return callback(env, request, url);
  if (route === 'GET /oauth/account') return showAccounts(env, request, url);
  if (route === 'POST /oauth/account') return pickAccount(env, request, url);
  if (route === 'GET /oauth/me') return me(env, request);
  if (route === 'POST /oauth/logout') return logout(env, request, url);

  return null;
};
