import { type AuthEnv, currentUser, grantFor, mintCliKey, usesCliKey } from './auth/routes';
import {
  DEFAULT_EVAL_MODEL,
  EVAL_MODELS,
  type EvalTask,
  evalStatus,
  type Install,
  installFleet,
  isCurrentFleet,
  probeUpload,
  startEval,
  teardown,
} from './install';

type StoredInstall = Install & { readonly evalTasks?: readonly EvalTask[]; readonly receipt?: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const UPLOAD_SCOPE = 'workers-scripts.admin';

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const page = (body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>port · installs</title><link rel="icon" href="/brand/favicon.svg"><style>body{font:15px/1.5 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#18181b}code,pre{font:12px ui-monospace,monospace}pre{background:#f4f4f2;padding:.75rem;border-radius:8px;overflow:auto}button{font:inherit;padding:.4rem .8rem;border-radius:6px;border:1px solid #ccc;background:#18181b;color:#fff;cursor:pointer}button.ghost{background:#fff;color:#18181b}button:disabled{opacity:.55;cursor:progress}button .spin{display:none;width:.8em;height:.8em;margin-right:.45em;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-.1em;animation:s .7s linear infinite}form.busy button .spin{display:inline-block}@keyframes s{to{transform:rotate(360deg)}}.note{color:#6b6b70;font-size:13px}.warn{background:#fff7ed;border:1px solid #fed7aa;padding:.6rem .8rem;border-radius:8px}section{border:1px solid #ebebe8;border-radius:10px;padding:1rem;margin:1rem 0}form{display:inline}</style></head><body><p><a href="/">← port</a></p>${body}<script>document.addEventListener('submit',(e)=>{const f=e.target;if(f.classList.contains('busy')){e.preventDefault();return}f.classList.add('busy');document.querySelectorAll('form button').forEach((b)=>{b.disabled=true});const b=f.querySelector('button');if(b&&b.dataset.busy)b.lastChild.textContent=b.dataset.busy})</script></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );

const isStoredInstall = (value: unknown): value is StoredInstall =>
  typeof value === 'object' && value !== null && 'id' in value && 'resources' in value && 'key' in value;

const publicView = ({ key: _key, ...rest }: StoredInstall) => rest;

const sameOrigin = (request: Request, url: URL) => request.headers.get('origin') === url.origin;

const randomReceipt = () =>
  [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');

const modelPicker = `<select name="model" style="font:inherit;padding:.35rem;margin-right:.4rem">${EVAL_MODELS.map(
  (m) =>
    `<option value="${m.id}"${m.id === DEFAULT_EVAL_MODEL ? ' selected' : ''}>${escapeHtml(m.label)}</option>`,
).join('')}</select>`;

const resourceLine = (install: StoredInstall) =>
  install.resources
    .map((r) => {
      const after =
        r.existsAfterTeardown === undefined
          ? ''
          : ` · after tear down: ${r.existsAfterTeardown ? 'still there' : 'gone'}`;
      return `<li><code>${escapeHtml(r.kind)}</code> ${escapeHtml(r.name)} · after install: ${String(r.existsAfterInstall ?? '?')}${after}</li>`;
    })
    .join('');

const installSection = (install: StoredInstall) => {
  const tearDown = `<form method="post" action="/installs/${install.id}/delete"><button class="ghost" data-busy="Deleting and checking…"><span class="spin"></span>Tear down</button></form>`;
  const leftovers = install.resources.some((r) => r.existsAfterTeardown !== false);
  const outdated =
    install.state === 'installed' && !isCurrentFleet(install)
      ? `<p class="warn">This install runs an older fleet. Tear it down and install again before you run the eval.</p>`
      : '';
  const actions =
    install.state === 'installed' && !isCurrentFleet(install)
      ? tearDown
      : install.state === 'installed'
        ? `<form method="post" action="/installs/${install.id}/eval">${modelPicker}<button data-busy="Starting 5 agents…"><span class="spin"></span>Run the 5 swarm-5 tasks</button></form> <a href="/installs/${install.id}/eval">Eval status</a> ${tearDown}`
        : install.state === 'failed' && leftovers
          ? tearDown
          : '';
  const receipt = install.receipt ?? '';

  return `<section><h2>Agent fleet <code>${install.id}</code> · ${escapeHtml(install.state)}</h2><p>${install.url === null ? 'No URL' : `<code>${escapeHtml(install.url)}</code>`}</p><ul>${resourceLine(install)}</ul>${outdated}<p>${actions}</p><p>Receipt: <a href="/receipts/${receipt}">/receipts/${receipt}</a></p><details><summary>Log</summary><pre>${escapeHtml(install.log.join('\n'))}</pre></details></section>`;
};

type Context = {
  readonly grant: ReturnType<typeof grantFor>;
  readonly token: { readonly accessToken: string; readonly accountId: string };
  readonly stored: readonly StoredInstall[];
};

const context = async (env: AuthEnv, request: Request, url: URL): Promise<Context | Response> => {
  const user = await currentUser(env, request);
  if (user === null) return Response.redirect(`${url.origin}/oauth/link`, 302);

  const grant = grantFor(env, user);
  const token = await grant.token(`${url.origin}/oauth/callback`);
  if (token === null || token.accountId === null) return Response.redirect(`${url.origin}/oauth/link`, 302);

  const summary = await grant.summary();
  const granted = (summary?.scope ?? '').split(' ');
  if (!granted.includes(UPLOAD_SCOPE))
    return page(
      `<h1>Sign in again</h1><p class="warn">Your sign-in does not include <code>${UPLOAD_SCOPE}</code>. Cloudflare refuses to upload a Worker with only <code>workers-scripts.edit</code>, so port now asks for Workers Admin.</p><p><a href="/oauth/link">Get a new sign-in link</a></p>`,
      403,
    );

  const parsed: unknown = JSON.parse(await grant.installs());
  const stored = Array.isArray(parsed) ? parsed.filter(isStoredInstall) : [];

  return { grant, token: { accessToken: token.accessToken, accountId: token.accountId }, stored };
};

const save = async (
  env: AuthEnv,
  ctx: Context,
  install: StoredInstall,
  extra: Record<string, unknown> = {},
) => {
  const receipt = install.receipt ?? randomReceipt();
  const next = { ...install, receipt };
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
    : new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
};

export const installRoute = async (env: AuthEnv, request: Request, url: URL): Promise<Response | null> => {
  if (url.pathname !== '/installs' && !url.pathname.startsWith('/installs/')) return null;
  if (request.method === 'POST' && !usesCliKey(request) && !sameOrigin(request, url))
    return page('<p>Cross-site request refused.</p>', 403);

  const ctx = await context(env, request, url);
  if (ctx instanceof Response) return ctx;

  const [, , id, action] = url.pathname.split('/');
  const cli = usesCliKey(request);
  const back = Response.redirect(`${url.origin}/installs`, 303);

  if (request.method === 'GET' && id === undefined)
    return page(
      `<h1>Your installs</h1><p>Everything here runs on your Cloudflare account. Tear down deletes each resource port created and then checks it is gone.</p><form method="post" action="/installs"><button data-busy="Installing… about 10 seconds"><span class="spin"></span>Install the agent fleet</button></form> <form method="post" action="/installs/probe"><button class="ghost" data-busy="Checking 7 uploads…"><span class="spin"></span>Check upload permissions</button></form> <form method="post" action="/installs/cli-key"><button class="ghost" data-busy="Making a key…"><span class="spin"></span>Get a CLI key</button></form>${[...ctx.stored].reverse().map(installSection).join('')}`,
    );

  if (request.method === 'POST' && id === undefined) {
    const installed = await save(env, ctx, await installFleet(ctx.token.accessToken, ctx.token.accountId));
    return cli ? json(publicView(installed), installed.state === 'installed' ? 201 : 502) : back;
  }

  if (request.method === 'POST' && id === 'probe') {
    const results = await probeUpload(ctx.token.accessToken, ctx.token.accountId);
    const receipt = randomReceipt();
    await env.RECEIPTS.put(receipt, JSON.stringify({ kind: 'upload-probe', at: Date.now(), results }));
    return page(
      `<h1>Upload check</h1><p>Each test Worker was uploaded and deleted at once.</p><pre>${escapeHtml(JSON.stringify(results, null, 2))}</pre><p>Receipt: <a href="/receipts/${receipt}">/receipts/${receipt}</a></p><p><a href="/installs">Back</a></p>`,
    );
  }

  if (request.method === 'POST' && id === 'cli-key') {
    const user = await currentUser(env, request);
    const key = user === null ? '' : await mintCliKey(env, user);
    return page(
      `<h1>CLI key</h1><p>This key acts as you on port for 24 hours: install, run, check and tear down. port does not store it. Treat it like a password.</p><p><input readonly value="${escapeHtml(key)}" style="width:100%;font:12px monospace;padding:8px" onclick="this.select()"></p><p><button onclick="navigator.clipboard.writeText(document.querySelector('input').value).then(()=>{this.textContent='Copied'})">Copy key</button></p><pre>curl -H "authorization: Bearer KEY" https://port.customer0.dev/installs/json</pre><p><a href="/installs">Back</a></p>`,
    );
  }

  if (request.method === 'GET' && id === 'json') return json(ctx.stored.map(publicView));

  const found = ctx.stored.find((each) => each.id === id);
  if (found === undefined) return page('<p>No such install.</p>', 404);

  if (request.method === 'POST' && action === 'eval') {
    try {
      const model = usesCliKey(request)
        ? (url.searchParams.get('model') ?? '')
        : String((await request.formData()).get('model') ?? '');
      const evalTasks = await startEval(found, model);
      await save(env, ctx, { ...found, evalTasks });
      return cli
        ? json({ started: evalTasks })
        : Response.redirect(`${url.origin}/installs/${found.id}/eval`, 303);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await save(env, ctx, { ...found, log: [...found.log, `eval failed to start: ${reason}`] });
      if (cli) return json({ error: reason }, 502);
      return page(
        `<h1>The eval did not start</h1><p class="warn">${escapeHtml(reason)}</p><p>port called <code>${escapeHtml(found.url ?? '')}/run</code> from Cloudflare's edge and got this back. Nothing ran and nothing was charged.</p><p><a href="/installs">Back</a></p>`,
        502,
      );
    }
  }

  if (request.method === 'GET' && action === 'eval') {
    const tasks = await evalStatus(found, found.evalTasks ?? []);
    await save(env, ctx, found, { eval: tasks });
    if (cli) return json({ install: found.id, tasks });
    const running = tasks.some(
      (t) => typeof t === 'object' && t !== null && Reflect.get(t, 'state') === 'running',
    );
    return page(
      `${running ? '<meta http-equiv="refresh" content="15">' : ''}<h1>Eval · ${found.id}</h1><p>${running ? 'Running. This page refreshes every 15 seconds.' : 'Finished.'}</p><pre>${escapeHtml(JSON.stringify(tasks, null, 2))}</pre><p><a href="/installs">Back</a></p>`,
    );
  }

  if (request.method === 'POST' && action === 'delete') {
    const removed = await save(env, ctx, await teardown(ctx.token.accessToken, found));
    return cli ? json(publicView(removed)) : back;
  }

  return page('<p>Not found.</p>', 404);
};
