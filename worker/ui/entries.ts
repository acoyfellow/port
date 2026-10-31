import type { Entry, Stage } from '../../shared/entry';
import { entryDiagram, entryThumbnail } from '../../shared/entry-diagram';
import { html, raw } from './html';
import type { Viewer } from './layout';
import { badge, linkButton, page, pageHead } from './parts';

const STAGE_BADGE: Record<Stage, ReturnType<typeof badge> | ''> = {
  installable: '',
  verified: '',
  outlined: badge('live', 'Outlined'),
  idea: badge('plain', 'Idea'),
};

const PRODUCT_LABEL: Record<Entry['parts'][number]['product'], string> = {
  worker: 'Worker',
  'durable-object': 'Durable Object',
  'worker-loader': 'Worker Loader',
  container: 'Container',
  'workers-ai': 'Workers AI',
  'ai-gateway': 'AI Gateway',
  kv: 'KV',
  d1: 'D1',
  r2: 'R2',
  queue: 'Queues',
  workflow: 'Workflows',
  browser: 'Browser Rendering',
  access: 'Access',
  external: 'Outside Cloudflare',
};

const products = (entry: Entry) => [...new Set(entry.parts.map((part) => PRODUCT_LABEL[part.product]))];

export const entryHref = (entry: Entry) => `/d/${entry.slug}`;

export const entryCard = (entry: Entry) =>
  html`<a class="card entry" href="${entryHref(entry)}" data-entry="${entry.slug}"><div class="thumb" data-thumb>${raw(entryThumbnail(entry))}</div><div class="entry-top"><div class="entry-icon" aria-hidden="true">${entry.mark}</div><h2>${entry.name}</h2>${STAGE_BADGE[entry.stage]}</div><p class="shape">${entry.shape}</p><p>${entry.oneLine}</p><div class="chips">${products(
    entry,
  ).map((label) => html`<span class="chip">${label}</span>`)}</div></a>`;

const list = (title: string, items: readonly string[]) =>
  items.length === 0
    ? ''
    : html`<section class="card"><h2>${title}</h2><ul class="muted">${items.map((item) => html`<li>${item}</li>`)}</ul></section>`;

const REPO = 'https://github.com/acoyfellow/port/blob/main';

const PI_TECH =
  'Every shape runs the same agent: stock Pi (pi-durable 1.4.0) inside a Durable Object. Pi owns the loop, the built-in tools (read, write, edit, bash, grep, find, ls) and the cost count. Its session lives in the Durable Object’s SQLite, so a restart mid-task picks up where it stopped. Model calls go through your AI Gateway to Workers AI. Only the place the tools run changes from shape to shape.';

const piSection = (entry: Entry) => {
  const receipt = entry.build;
  return html`<section class="card build pi-tech"><div class="pi-head"><a href="https://pi.dev" class="pi-mark" aria-label="Pi"><img src="/pi-logo.svg" alt="Pi logo" width="40" height="40"></a><h2>Runs on <a href="https://pi.dev">Pi</a></h2></div><p>${PI_TECH}</p>${
    entry.tools === undefined ? '' : html`<p><strong>Where the tools run here:</strong> ${entry.tools}</p>`
  }${
    receipt === undefined
      ? html`<p class="muted">No Pi run is recorded for this shape yet.</p>`
      : html`<p>${`Last run: Pi ${receipt.task}. ${receipt.infrastructure}`}</p><dl><div><dt>Pi cost</dt><dd>$${receipt.usd.toFixed(4)}</dd></div><div><dt>Tokens</dt><dd>${receipt.tokens.toLocaleString('en-US')}</dd></div><div><dt>Time</dt><dd>${receipt.seconds} s</dd></div><div><dt>Restart mid-task</dt><dd>${receipt.resumed ? 'resumed' : 'did not resume'}</dd></div></dl><p class="muted">Run on <code>${receipt.on}</code>, then torn down. <a href="${REPO}/shapes/${entry.slug}">Source</a> · <a href="${REPO}/proof/pi/${entry.slug}.json">Receipt</a></p>`
  }</section>`;
};

const installAction = (entry: Entry, viewer: Viewer) =>
  entry.install.status !== 'ready'
    ? ''
    : viewer === null
      ? linkButton('/sign-in?next=/installs', { label: 'Sign in to install' })
      : linkButton('/installs', { label: 'Install on my account' });

export const entryPage = (viewer: Viewer, entry: Entry) =>
  page({
    title: entry.name,
    viewer,
    section: 'home',
    crumbs: [{ label: 'Directory', href: '/' }, { label: entry.name }],
    body: html`${pageHead(entry.name, html`${STAGE_BADGE[entry.stage]} ${entry.oneLine}`, installAction(entry, viewer))}<div class="stack">${piSection(entry)}<figure class="card diagram"><figcaption>${entry.shape}</figcaption>${raw(
      entryDiagram(entry),
    )}</figure><div class="grid">${list('Strengths', entry.strengths)}${list('Limits', entry.limits)}<section class="card"><h2>Parts</h2><ul class="muted">${entry.parts.map(
      (part) => html`<li><strong>${part.label}</strong> · ${part.detail}</li>`,
    )}</ul></section></div>${
      entry.build === undefined
        ? html`<div class="grid"><section class="card"><h2>Install ${badge(
            entry.install.status === 'ready' ? 'ok' : 'plain',
            entry.install.status === 'ready'
              ? 'Ready'
              : entry.install.status === 'planned'
                ? 'Planned'
                : 'Not planned',
          )}</h2><p class="muted">${entry.install.plan}</p></section><section class="card"><h2>Eval</h2><p class="muted">${entry.evalPlan}</p></section></div>`
        : ''
    }<p class="muted">This shape was first seen in <code>${entry.source}</code>. port builds its own copy on stock Pi.</p></div>`,
  });
