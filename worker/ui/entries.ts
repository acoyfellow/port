import type { Entry, Stage } from '../../shared/entry';
import { entryDiagram } from '../../shared/entry-diagram';
import { html, raw } from './html';
import type { Viewer } from './layout';
import { badge, linkButton, page, pageHead } from './parts';

const STAGE_BADGE: Record<Stage, ReturnType<typeof badge>> = {
  installable: badge('ok', 'Installable'),
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
  html`<a class="card entry" href="${entryHref(entry)}" data-entry="${entry.slug}"><div class="entry-top"><div class="entry-icon" aria-hidden="true">${entry.mark}</div><h2>${entry.name}</h2>${STAGE_BADGE[entry.stage]}</div><p class="shape">${entry.shape}</p><p>${entry.oneLine}</p><div class="chips">${products(
    entry,
  ).map((label) => html`<span class="chip">${label}</span>`)}</div></a>`;

const list = (title: string, items: readonly string[]) =>
  items.length === 0
    ? ''
    : html`<section class="card"><h2>${title}</h2><ul class="muted">${items.map((item) => html`<li>${item}</li>`)}</ul></section>`;

const measures = (entry: Entry) =>
  entry.measures.length === 0
    ? ''
    : html`<section><div class="section-head"><h2>Measured</h2><p>Each number links to where it came from.</p></div><div class="card table-card"><table><thead><tr><th>What</th><th>Value</th><th>Source</th></tr></thead><tbody>${entry.measures.map(
        (measure) =>
          html`<tr><td>${measure.label}</td><td><strong>${measure.value}</strong></td><td><code>${measure.source}</code></td></tr>`,
      )}</tbody></table></div></section>`;

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
    body: html`${pageHead(entry.name, html`${STAGE_BADGE[entry.stage]} ${entry.oneLine}`, installAction(entry, viewer))}<div class="stack"><figure class="card diagram"><figcaption>${entry.shape}</figcaption>${raw(
      entryDiagram(entry),
    )}</figure><div class="grid">${list('Strengths', entry.strengths)}${list('Limits', entry.limits)}<section class="card"><h2>Parts</h2><ul class="muted">${entry.parts.map(
      (part) => html`<li><strong>${part.label}</strong> · ${part.detail}</li>`,
    )}</ul></section></div>${measures(entry)}<div class="grid"><section class="card"><h2>Install ${badge(
      entry.install.status === 'ready' ? 'ok' : 'plain',
      entry.install.status === 'ready'
        ? 'Ready'
        : entry.install.status === 'planned'
          ? 'Planned'
          : 'Not planned',
    )}</h2><p class="muted">${entry.install.plan}</p></section><section class="card"><h2>Eval</h2><p class="muted">${entry.evalPlan}</p></section></div><p class="muted">Source: <code>${entry.source}</code></p></div>`,
  });
