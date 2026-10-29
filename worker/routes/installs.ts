import { type AuthEnv, currentUser, grantFor, mintCliKey, usesCliKey, viewerOf } from '../auth/routes';
import {
  type EvalTask,
  evalStatus,
  type Install,
  installFleet,
  probeUpload,
  startEval,
  teardown,
} from '../install';
import { html } from '../ui/html';
import {
  cliKeyPage,
  installPage,
  installsPage,
  probePage,
  type Run,
  type RunTask,
  runPage,
} from '../ui/installs';
import type { Viewer } from '../ui/layout';
import { errorPage, linkButton, notFound } from '../ui/parts';

type StoredRun = Run & { readonly tasks: readonly EvalTask[] };

type StoredInstall = Install & {
  readonly receipt?: string;
  readonly runs?: readonly StoredRun[];
  readonly evalTasks?: readonly EvalTask[];
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const UPLOAD_SCOPE = 'workers-scripts.admin';

const isStoredInstall = (value: unknown): value is StoredInstall =>
  typeof value === 'object' && value !== null && 'id' in value && 'resources' in value && 'key' in value;

const runIdOf = (task: EvalTask | undefined) => task?.agent.split('-').at(-1) ?? '';

const runsOf = (install: Pick<StoredInstall, 'runs' | 'evalTasks' | 'createdAt'>): readonly StoredRun[] => {
  if (install.runs !== undefined) return install.runs;
  const legacy = install.evalTasks ?? [];
  const first = legacy[0];
  return first === undefined
    ? []
    : [{ id: runIdOf(first), model: first.model, startedAt: install.createdAt, tasks: legacy }];
};

const publicView = ({ key: _key, evalTasks: _legacy, ...rest }: StoredInstall) => ({
  ...rest,
  runs: runsOf(rest),
});

const view = (install: StoredInstall) => ({ ...install, runs: runsOf(install) });

const sameOrigin = (request: Request, url: URL) => request.headers.get('origin') === url.origin;

const randomReceipt = () =>
  [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');

const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;

const text = (value: unknown) => (typeof value === 'string' ? value : null);

const counts = (value: unknown) => {
  const passed = field(value, 'passed');
  const total = field(value, 'total');
  return typeof passed === 'number' && typeof total === 'number' ? { passed, total } : null;
};

export const runTaskOf = (status: unknown, fallback: string): RunTask => {
  const passed = field(status, 'passed');
  return {
    task: text(field(status, 'task')) ?? fallback,
    state: text(field(status, 'state')) ?? 'unknown',
    turns: number(field(status, 'turns')),
    usd: number(field(status, 'usd')),
    ms: number(field(status, 'ms')),
    startedAt: number(field(status, 'startedAt')),
    passed: typeof passed === 'boolean' ? passed : null,
    hidden: counts(field(status, 'hidden')),
    error: text(field(status, 'error')),
  };
};

type Context = {
  readonly user: string;
  readonly viewer: Viewer;
  readonly grant: ReturnType<typeof grantFor>;
  readonly token: { readonly accessToken: string; readonly accountId: string };
  readonly stored: readonly StoredInstall[];
};

const signInAgain = (viewer: Viewer, detail: string) =>
  errorPage({
    status: 403,
    title: 'Sign in again',
    detail,
    viewer,
    actions: [linkButton('/sign-in?next=/installs', { label: 'Sign in again' })],
  });

const toSignIn = (url: URL) =>
  Response.redirect(`${url.origin}/sign-in?next=${encodeURIComponent(url.pathname)}`, 302);

const context = async (env: AuthEnv, request: Request, url: URL): Promise<Context | Response> => {
  const cli = usesCliKey(request);
  const user = await currentUser(env, request);
  if (user === null) return cli ? json({ error: 'The CLI key is not valid.' }, 401) : toSignIn(url);

  const viewer = await viewerOf(env, user);
  const grant = grantFor(env, user);
  const token = await grant.token(`${url.origin}/oauth/callback`);
  if (token === null) return cli ? json({ error: 'Sign in again.' }, 401) : toSignIn(url);
  if (token.accountId === null) return Response.redirect(`${url.origin}/oauth/account`, 302);

  const granted = ((await grant.summary())?.scope ?? '').split(' ');
  if (!granted.includes(UPLOAD_SCOPE))
    return signInAgain(
      viewer,
      `Your sign-in does not include ${UPLOAD_SCOPE}. Cloudflare refuses to upload a Worker without it.`,
    );

  const parsed: unknown = JSON.parse(await grant.installs());
  const stored = Array.isArray(parsed) ? parsed.filter(isStoredInstall) : [];

  return {
    user,
    viewer,
    grant,
    token: { accessToken: token.accessToken, accountId: token.accountId },
    stored,
  };
};

const save = async (
  env: AuthEnv,
  ctx: Context,
  install: StoredInstall,
  extra: Record<string, unknown> = {},
) => {
  const receipt = install.receipt ?? randomReceipt();
  const { evalTasks: _legacy, ...rest } = install;
  const next: StoredInstall = { ...rest, runs: runsOf(install), receipt };
  await ctx.grant.putInstall(next.id, JSON.stringify(next));
  await env.RECEIPTS.put(receipt, JSON.stringify({ ...publicView(next), ...extra, savedAt: Date.now() }));
  return next;
};

export const receiptRoute = async (env: AuthEnv, url: URL): Promise<Response | null> => {
  const match = /^\/receipts\/([0-9a-f]{32})$/.exec(url.pathname);
  if (match === null) return null;
  const body = await env.RECEIPTS.get(match[1] ?? '');
  return body === null
    ? json({ error: 'No such receipt.' }, 404)
    : new Response(body, {
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
};

const failedToStart = (viewer: Viewer, install: StoredInstall, reason: string) =>
  errorPage({
    status: 502,
    title: 'The run did not start',
    detail: html`${reason} port called the fleet at ${install.url ?? 'no address'} and got this back. Nothing ran and nothing was charged.`,
    viewer,
    actions: [linkButton(`/installs/${install.id}`, { label: 'Back to the install' })],
  });

const refused = () =>
  errorPage({
    status: 403,
    title: 'Request refused',
    detail: 'This form was sent from another site.',
    viewer: null,
  });

const startRun = async (
  env: AuthEnv,
  ctx: Context,
  request: Request,
  url: URL,
  found: StoredInstall,
  cli: boolean,
) => {
  try {
    const model = cli
      ? (url.searchParams.get('model') ?? '')
      : String((await request.formData()).get('model') ?? '');
    const tasks = await startEval(found, model);
    const run: StoredRun = {
      id: runIdOf(tasks[0]) || randomReceipt().slice(0, 6),
      model: tasks[0]?.model ?? model,
      startedAt: Date.now(),
      tasks,
    };
    await save(env, ctx, { ...found, runs: [...runsOf(found), run] });
    return cli
      ? json({ run: run.id, started: tasks })
      : Response.redirect(`${url.origin}/installs/${found.id}/runs/${run.id}`, 303);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await save(env, ctx, { ...found, log: [...found.log, `run failed to start: ${reason}`] });
    return cli ? json({ error: reason }, 502) : failedToStart(ctx.viewer, found, reason);
  }
};

const showRun = async (env: AuthEnv, ctx: Context, found: StoredInstall, run: StoredRun, cli: boolean) => {
  const statuses = await evalStatus(found, run.tasks);
  await save(env, ctx, found, { run: run.id, eval: statuses });
  const tasks = statuses.map((status, index) => runTaskOf(status, run.tasks[index]?.task ?? ''));
  return cli
    ? json({ install: found.id, run: run.id, tasks: statuses })
    : runPage(ctx.viewer, view(found), run, tasks, Date.now());
};

export const installRoute = async (env: AuthEnv, request: Request, url: URL): Promise<Response | null> => {
  if (url.pathname !== '/installs' && !url.pathname.startsWith('/installs/')) return null;
  const cli = usesCliKey(request);
  if (request.method === 'POST' && !cli && !sameOrigin(request, url)) return refused();

  const ctx = await context(env, request, url);
  if (ctx instanceof Response) return ctx;

  const [, , id, action, runId] = url.pathname.split('/');
  const to = (path: string) => Response.redirect(`${url.origin}${path}`, 303);
  const missing = (what: string) =>
    cli
      ? json({ error: `No such ${what.toLowerCase()}.` }, 404)
      : notFound(ctx.viewer, `This ${what.toLowerCase()}`);

  if (request.method === 'GET' && id === undefined)
    return cli
      ? json(ctx.stored.map(publicView))
      : installsPage(ctx.viewer, [...ctx.stored].reverse().map(view));

  if (request.method === 'POST' && id === undefined) {
    const installed = await save(env, ctx, await installFleet(ctx.token.accessToken, ctx.token.accountId));
    return cli
      ? json(publicView(installed), installed.state === 'installed' ? 201 : 502)
      : to(`/installs/${installed.id}`);
  }

  if (request.method === 'POST' && id === 'probe') {
    const results = await probeUpload(ctx.token.accessToken, ctx.token.accountId);
    const receipt = randomReceipt();
    await env.RECEIPTS.put(receipt, JSON.stringify({ kind: 'upload-probe', at: Date.now(), results }));
    return cli ? json({ receipt, results }) : probePage(ctx.viewer, results, receipt);
  }

  if (request.method === 'POST' && id === 'cli-key') {
    const key = await mintCliKey(env, ctx.user);
    return cli ? json({ key }) : cliKeyPage(ctx.viewer, key, url.origin);
  }

  if (request.method === 'GET' && id === 'json') return json(ctx.stored.map(publicView));

  const found = ctx.stored.find((each) => each.id === id);
  if (found === undefined) return missing('Install');

  if (request.method === 'GET' && action === undefined)
    return cli ? json(publicView(found)) : installPage(ctx.viewer, view(found));

  if (request.method === 'POST' && (action === 'runs' || action === 'eval'))
    return startRun(env, ctx, request, url, found, cli);

  if (request.method === 'POST' && action === 'delete') {
    const removed = await save(env, ctx, await teardown(ctx.token.accessToken, found));
    return cli ? json(publicView(removed)) : to(`/installs/${removed.id}`);
  }

  if (request.method === 'GET' && (action === 'eval' || action === 'runs')) {
    const runs = runsOf(found);
    const run = action === 'eval' ? runs.at(-1) : runs.find((each) => each.id === runId);
    return run === undefined ? missing('Run') : showRun(env, ctx, found, run, cli);
  }

  return missing('Page');
};
