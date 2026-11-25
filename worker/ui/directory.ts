import { FLEET } from '../../shared/catalog';
import { ENTRIES } from '../../shared/entries/index';
import { installArt, signInArt, teardownArt } from './blueprint';
import { costChart } from './cost-chart';
import { directoryTable, type Sort } from './directory-table';
import { html } from './html';
import type { Viewer } from './layout';
import { linkButton, page } from './parts';

const CREATED_LABEL: Record<(typeof FLEET.creates)[number], string> = {
  worker: 'One Worker, with a Durable Object and a Worker Loader',
  'ai-gateway': 'One AI Gateway for the model calls',
};

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
    html`<li class="bp-step"><div class="bp-text"><span class="bp-num">${String(index + 1).padStart(2, '0')}</span><strong>${title}</strong><p>${text}</p></div>${art}</li>`,
)}</ol></section>`;

const fleetCallout = () =>
  html`<section class="card" style="margin-bottom:20px;display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between"><div><strong>Running 10 agents at once? Start with our measured fleet winners.</strong><p class="muted" style="margin-top:4px">We tested 6 fleet setups on Cloudflare. Putting a 3-wide queue over Worker isolates beat every baseline at under 1¢ per finished task.</p></div>${linkButton('/benchmarks', { label: 'See the winners →' })}</section>`;

export const homePage = (viewer: Viewer, sort: Sort = { key: '', dir: 'asc' }) =>
  page({
    title: 'Agent infra for your Cloudflare account',
    viewer,
    section: 'home',
    body: html`${howItWorks}${fleetCallout()}<section id="directory"><div class="section-head"><div><h2>Directory</h2><p>Every shape runs stock Pi on your Cloudflare account. Pick one to inspect its architecture and deploy it.</p><details class="cost-note" style="margin-top:6px"><summary style="cursor:pointer">About the scores and costs</summary><p style="margin-top:6px"><strong>Coding eval</strong>: 5 coding tasks graded by hidden tests on Kimi K2.6 (deprecated by Workers AI on 2026-11-20). <strong>10-seat fleet</strong>: 10 concurrent seats on live DeepSeek V4.1 Flash — see <a href="/benchmarks">Fleet setups</a> for details. <strong>AI cost / task</strong> is model spend only (100¢ = $1); * marks older capped runs.</p></details></div></div>${costChart(ENTRIES)}${directoryTable(ENTRIES, sort)}</section></div>`,
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
