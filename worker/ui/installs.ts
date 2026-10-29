import { FLEET } from '../../shared/catalog';
import { DEFAULT_EVAL_MODEL, EVAL_MODELS, type Install, isCurrentFleet } from '../install';
import { html, type Part } from './html';
import type { Viewer } from './layout';
import {
  badge,
  copyField,
  dollars,
  linkButton,
  notice,
  page,
  pageHead,
  postButton,
  seconds,
  type Tone,
  when,
} from './parts';

export type RunTask = {
  readonly task: string;
  readonly state: string;
  readonly turns: number;
  readonly usd: number;
  readonly ms: number;
  readonly startedAt: number;
  readonly passed: boolean | null;
  readonly hidden: { readonly passed: number; readonly total: number } | null;
  readonly error: string | null;
};

export type Run = { readonly id: string; readonly model: string; readonly startedAt: number };

export type InstallView = Install & { readonly receipt?: string; readonly runs: readonly Run[] };

type Status = { readonly tone: Tone; readonly label: string };

export const installStatus = (install: Install): Status => {
  if (install.state === 'removed') return { tone: 'plain', label: 'Torn down' };
  if (install.state === 'failed') return { tone: 'bad', label: 'Install failed' };
  if (!isCurrentFleet(install)) return { tone: 'warn', label: 'Out of date' };
  return { tone: 'ok', label: 'Installed' };
};

const leftovers = (install: Install) => install.resources.some((r) => r.existsAfterTeardown !== false);

const canTearDown = (install: Install) => install.state !== 'removed' && leftovers(install);

const canRun = (install: Install) => install.state === 'installed' && isCurrentFleet(install);

const installHref = (install: Install) => `/installs/${install.id}`;

const modelLabel = (id: string) => EVAL_MODELS.find((model) => model.id === id)?.label.split(' · ')[0] ?? id;

const tearDownButton = (install: Install, small = false) =>
  postButton(`${installHref(install)}/delete`, {
    label: 'Tear down',
    busy: 'Deleting and checking…',
    kind: 'danger',
    small,
    confirm: `Delete every resource of install ${install.id} from your account?`,
  });

const installButton = (label = 'Install the agent fleet') =>
  postButton('/installs', { label, busy: 'Installing… about 10 seconds' });

const viewerCrumbs = (...rest: { label: string; href?: string }[]) => [
  { label: 'Installs', href: '/installs' },
  ...rest,
];

const installRow = (install: InstallView) => {
  const status = installStatus(install);
  return html`<tr><td><a class="row-link" href="${installHref(install)}">${FLEET.name}</a><div class="muted mono">${install.id}</div></td><td>${badge(
    status.tone,
    status.label,
  )}</td><td class="muted">${when(install.createdAt)}</td><td class="num">${install.runs.length}</td><td class="num">${linkButton(
    installHref(install),
    { label: 'Manage', kind: 'ghost', small: true },
  )}</td></tr>`;
};

export const installsPage = (viewer: Viewer, installs: readonly InstallView[]) => {
  const active = installs.filter((install) => install.state !== 'removed');
  const past = installs.filter((install) => install.state === 'removed');
  const table = (rows: readonly InstallView[]) =>
    html`<div class="card table-card"><table class="fixed"><colgroup><col style="width:28%"><col style="width:20%"><col style="width:26%"><col style="width:10%"><col style="width:16%"></colgroup><thead><tr><th>Install</th><th>Status</th><th>Created</th><th class="num">Runs</th><th class="num"><span class="sr">Actions</span></th></tr></thead><tbody>${rows.map(
      installRow,
    )}</tbody></table></div>`;

  return page({
    title: 'Your installs',
    viewer,
    section: 'installs',
    body: html`${pageHead(
      'Your installs',
      'Each install lives on your Cloudflare account. Open one to run the eval or tear it down.',
      installButton(),
    )}<div class="stack">${
      active.length === 0
        ? html`<div class="card empty"><strong>Nothing installed</strong><p>Install the agent fleet to create one Worker and one AI Gateway on your account.</p><div class="actions">${installButton()}${linkButton(
            '/fleet',
            { label: 'What it creates', kind: 'ghost' },
          )}</div></div>`
        : table(active)
    }${
      past.length === 0
        ? ''
        : html`<section><div class="section-head"><h2>Torn down</h2><p>Kept for their receipts.</p></div>${table(past)}</section>`
    }</div>`,
  });
};

const resourceRows = (install: Install) =>
  install.resources.map((resource) => {
    const now =
      resource.existsAfterTeardown === false
        ? badge('plain', 'Deleted')
        : resource.existsAfterInstall === true
          ? badge('ok', 'Exists')
          : badge('warn', 'Not checked');
    return html`<tr><td class="mono">${resource.kind}</td><td>${resource.name}</td><td>${now}</td></tr>`;
  });

const runRows = (install: Install, runs: readonly Run[]) =>
  runs.length === 0
    ? html`<div class="card empty"><strong>No runs yet</strong><p>A run starts 5 agents, one for each swarm-5 task, and grades them on hidden tests.</p></div>`
    : html`<div class="card table-card"><table><thead><tr><th>Run</th><th>Model</th><th>Started</th><th class="num"></th></tr></thead><tbody>${[
        ...runs,
      ]
        .reverse()
        .map(
          (run) =>
            html`<tr><td><a class="row-link mono" href="${installHref(install)}/runs/${run.id}">${run.id}</a></td><td>${modelLabel(
              run.model,
            )}</td><td class="muted">${when(run.startedAt)}</td><td class="num">${linkButton(
              `${installHref(install)}/runs/${run.id}`,
              { label: 'Open', kind: 'ghost', small: true },
            )}</td></tr>`,
        )}</tbody></table></div>`;

const modelPicker = () =>
  html`<select name="model" aria-label="Model">${EVAL_MODELS.map(
    (model) =>
      html`<option value="${model.id}"${model.id === DEFAULT_EVAL_MODEL ? html` selected` : ''}>${model.label}</option>`,
  )}</select>`;

const runForm = (install: Install) =>
  postButton(`${installHref(install)}/runs`, {
    label: 'Run the eval',
    busy: 'Starting 5 agents…',
    fields: modelPicker(),
  });

const installNotice = (install: Install): Part => {
  if (install.state === 'failed')
    return notice(
      'bad',
      html`<strong>The install did not finish.</strong> ${
        canTearDown(install)
          ? 'Tear it down to delete what was created, then install again.'
          : 'Nothing was left on your account.'
      }`,
    );
  if (install.state === 'installed' && !isCurrentFleet(install))
    return notice(
      'warn',
      'This install runs an older fleet. Tear it down and install again before you run the eval.',
    );
  if (install.state === 'removed')
    return notice('plain', 'Torn down. port checked each resource with the Cloudflare API and none is left.');
  return '';
};

export const installPage = (viewer: Viewer, install: InstallView) => {
  const status = installStatus(install);
  return page({
    title: `Install ${install.id}`,
    viewer,
    section: 'installs',
    crumbs: viewerCrumbs({ label: install.id }),
    body: html`<div class="head"><div><h1>${FLEET.name} ${badge(status.tone, status.label)}</h1><p class="mono">${install.id}</p></div><div class="actions">${
      canTearDown(install) ? tearDownButton(install) : ''
    }</div></div><div class="stack">${installNotice(install)}${
      canRun(install)
        ? html`<section class="card"><h2>Run the eval</h2><p>5 agents work on the swarm-5 tasks at the same time. Model calls are billed to your account.</p><div class="actions" style="margin-top:14px">${runForm(
            install,
          )}</div></section>`
        : ''
    }<section><div class="section-head"><h2>Runs</h2></div>${runRows(install, install.runs)}</section><section><div class="section-head"><h2>Resources on your account</h2></div><div class="card table-card"><table><thead><tr><th>Kind</th><th>Name</th><th>Now</th></tr></thead><tbody>${resourceRows(
      install,
    )}</tbody></table></div></section><section class="card"><h2>Details</h2><dl class="kv" style="margin-top:12px"><dt>Created</dt><dd>${when(
      install.createdAt,
    )}</dd><dt>Address</dt><dd class="mono">${install.url ?? 'None'}</dd><dt>Fleet build</dt><dd class="mono">${
      install.fleetVersion ?? 'Unknown'
    }</dd><dt>Receipt</dt><dd>${
      install.receipt === undefined
        ? 'None'
        : html`<a class="mono" href="/receipts/${install.receipt}">/receipts/${install.receipt}</a>`
    }</dd></dl><details style="margin-top:14px"><summary>Install log</summary><pre>${install.log.join('\n')}</pre></details></section></div>`,
  });
};

const taskStatus = (task: RunTask): Status => {
  if (task.state === 'running') return { tone: 'live', label: 'Running' };
  if (task.passed === true) return { tone: 'ok', label: 'Passed' };
  if (task.state === 'done') return { tone: 'bad', label: 'Failed' };
  return { tone: 'bad', label: task.state === 'failed' ? 'Failed' : task.state };
};

const taskMs = (task: RunTask, now: number) => (task.state === 'running' ? now - task.startedAt : task.ms);

export const runPage = (
  viewer: Viewer,
  install: InstallView,
  run: Run,
  tasks: readonly RunTask[],
  now: number,
) => {
  const running = tasks.some((task) => task.state === 'running');
  const passed = tasks.filter((task) => task.passed === true).length;
  const usd = tasks.reduce((total, task) => total + task.usd, 0);
  const longest = Math.max(0, ...tasks.map((task) => taskMs(task, now)));
  const runStatus: Status = running
    ? { tone: 'live', label: 'Running' }
    : passed >= 4
      ? { tone: 'ok', label: 'Finished' }
      : { tone: 'warn', label: 'Finished' };

  return page({
    title: `Run ${run.id}`,
    viewer,
    section: 'installs',
    refreshSeconds: running ? 10 : undefined,
    crumbs: viewerCrumbs({ label: install.id, href: installHref(install) }, { label: `Run ${run.id}` }),
    body: html`<div class="head"><div><h1>Run ${run.id} ${badge(runStatus.tone, runStatus.label)}</h1><p>${modelLabel(
      run.model,
    )} · started ${when(run.startedAt)}${running ? ' · this page refreshes every 10 seconds' : ''}</p></div><div class="actions">${
      canRun(install) && !running
        ? linkButton(installHref(install), { label: 'Run again', kind: 'ghost' })
        : ''
    }</div></div><div class="stack"><div class="stats"><div class="stat"><small>Passed hidden tests</small><strong>${passed} of ${
      tasks.length
    }</strong></div><div class="stat"><small>Model cost</small><strong>${dollars(usd)}</strong></div><div class="stat"><small>Longest task</small><strong>${seconds(
      longest,
    )}</strong></div><div class="stat"><small>Turns</small><strong>${tasks.reduce(
      (total, task) => total + task.turns,
      0,
    )}</strong></div></div><div class="card table-card"><table><thead><tr><th>Task</th><th>Status</th><th class="num">Hidden tests</th><th class="num">Turns</th><th class="num">Cost</th><th class="num">Time</th></tr></thead><tbody>${tasks.map(
      (task) => {
        const status = taskStatus(task);
        return html`<tr><td class="mono">${task.task}${
          task.error === null
            ? ''
            : html`<div class="muted" style="font-family:var(--sans)">${task.error}</div>`
        }</td><td>${badge(status.tone, status.label)}</td><td class="num">${
          task.hidden === null ? '—' : `${task.hidden.passed}/${task.hidden.total}`
        }</td><td class="num">${task.turns}</td><td class="num">${dollars(task.usd)}</td><td class="num">${seconds(
          taskMs(task, now),
        )}</td></tr>`;
      },
    )}</tbody></table></div>${
      running
        ? ''
        : html`<div class="actions">${linkButton(installHref(install), { label: 'Back to the install', kind: 'ghost' })}</div>`
    }</div>`,
  });
};

export const probePage = (viewer: Viewer, results: unknown, receipt: string) =>
  page({
    title: 'Upload check',
    viewer,
    section: 'installs',
    crumbs: viewerCrumbs({ label: 'Upload check' }),
    body: html`${pageHead('Upload check', 'Each test Worker was uploaded and then deleted at once.')}<div class="stack"><pre>${JSON.stringify(
      results,
      null,
      2,
    )}</pre><p>Receipt: <a class="mono" href="/receipts/${receipt}">/receipts/${receipt}</a></p></div>`,
  });

export const cliKeyPage = (viewer: Viewer, key: string, origin: string) =>
  page({
    title: 'CLI key',
    viewer,
    section: 'account',
    crumbs: [{ label: 'Account', href: '/account' }, { label: 'CLI key' }],
    body: html`${pageHead(
      'CLI key',
      'This key acts as you on port for 24 hours: install, run, check and tear down. port does not store it. Treat it like a password.',
    )}<div class="stack">${copyField('cli-key', key, 'CLI key')}<pre>curl -H "authorization: Bearer $PORT_KEY" ${origin}/installs/json</pre></div>`,
  });
