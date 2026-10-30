import { DIRECTORY_SLOTS, FLEET } from '../../shared/catalog';
import { ENTRIES } from '../../shared/entries/index';
import { installArt, signInArt, teardownArt } from './blueprint';
import { entryCard } from './entries';
import { html } from './html';
import type { Viewer } from './layout';
import { cloudflareButton, linkButton, page } from './parts';

const CREATED_LABEL: Record<(typeof FLEET.creates)[number], string> = {
  worker: 'One Worker, with a Durable Object and a Worker Loader',
  'ai-gateway': 'One AI Gateway for the model calls',
};

const skeletonCard = () =>
  html`<div class="card entry skeleton" aria-hidden="true"><div class="entry-top"><div class="entry-icon"></div><div class="bar title"></div></div><div class="bar w80"></div><div class="bar w60"></div><div class="chips"><div class="bar" style="width:72px"></div><div class="bar" style="width:96px"></div></div></div>`;

const primary = (viewer: Viewer) =>
  viewer === null ? cloudflareButton('/sign-in') : linkButton('/installs', { label: 'Your installs' });

const STEPS = [
  [
    'Sign in',
    'Sign in with Cloudflare and pick one account. port asks only for the permissions an install uses.',
    signInArt,
  ],
  [
    'Install and run',
    'port creates the resources on that account. Then it runs the eval against them.',
    installArt,
  ],
  [
    'Tear down',
    'port deletes each resource. Then it asks the Cloudflare API to confirm that 0 are left.',
    teardownArt,
  ],
] as const;

const howItWorks = html`<section class="blueprint" aria-labelledby="how"><div class="bp-head"><span class="bp-tag">How it works</span><h1 id="how">Agent infra on your own Cloudflare account.</h1><p>Each install runs on your account and your bill.</p></div><ol class="bp-steps">${STEPS.map(
  ([title, text, art], index) =>
    html`<li class="bp-step">${art}<div><span class="bp-num">${String(index + 1).padStart(2, '0')}</span><strong>${title}</strong><p>${text}</p></div></li>`,
)}</ol></section>`;

export const homePage = (viewer: Viewer) =>
  page({
    title: 'Agent infra for your Cloudflare account',
    viewer,
    section: 'home',
    body: html`${howItWorks}<div class="actions bp-actions">${primary(viewer)}${linkButton('/fleet', {
      label: 'See the agent fleet',
      kind: 'ghost',
    })}</div><section><div class="section-head"><h2>Directory</h2><p>Each shape has a diagram, its parts and what was measured. Most have a port build that was deployed, tested and deleted.</p></div><div class="grid">${ENTRIES.map(entryCard)}${Array.from(
      { length: Math.max(0, DIRECTORY_SLOTS - ENTRIES.length) },
      skeletonCard,
    )}</div></section></div>`,
  });

export const fleetPage = (viewer: Viewer) =>
  page({
    title: FLEET.name,
    viewer,
    section: 'home',
    crumbs: [{ label: 'Directory', href: '/' }, { label: FLEET.name }],
    body: html`<div class="head"><div><h1>${FLEET.name}</h1><p>${FLEET.oneLine}</p></div><div class="actions">${
      viewer === null
        ? linkButton('/sign-in?next=/installs', { label: 'Sign in to install' })
        : linkButton('/installs', { label: 'Install on my account' })
    }</div></div><div class="stack"><figure class="card" style="margin:0"><img src="/fleet.svg" alt="port uploads one Fleet Worker to your account. The Worker uses a Durable Object, a Worker Loader and Workers AI. Model calls go through an AI Gateway." style="display:block;width:100%;height:auto"></figure><div class="grid"><section class="card"><h2>What it creates</h2><ul class="muted">${FLEET.creates.map(
      (kind) => html`<li>${CREATED_LABEL[kind]}</li>`,
    )}</ul><p class="muted">Tear down deletes both, then checks with the Cloudflare API that they are gone.</p></section><section class="card"><h2>Permissions it uses</h2><div class="chips" style="margin-top:10px">${FLEET.scopes.map(
      (scope) => html`<span class="chip">${scope}</span>`,
    )}</div></section><section class="card"><h2>Evidence</h2><ul class="muted">${FLEET.evidence.map(
      (line) => html`<li>${line}</li>`,
    )}</ul></section></div></div>`,
  });
