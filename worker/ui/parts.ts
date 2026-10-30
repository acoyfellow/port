import { html, type Part } from './html';
import { type Layout, respond, type Viewer } from './layout';

export type Tone = 'ok' | 'live' | 'warn' | 'bad' | 'plain';

export const badge = (tone: Tone, label: string) =>
  html`<span class="badge${tone === 'plain' ? '' : ` ${tone}`}">${label}</span>`;

export type Button = {
  readonly label: string;
  readonly busy?: string;
  readonly kind?: 'primary' | 'ghost' | 'danger';
  readonly small?: boolean;
};

const buttonClass = (button: Button) =>
  `btn${button.kind === undefined || button.kind === 'primary' ? '' : ` ${button.kind}`}${button.small ? ' small' : ''}`;

export const button = (button: Button) =>
  html`<button class="${buttonClass(button)}"${
    button.busy === undefined ? '' : html` data-busy="${button.busy}"`
  }><span class="spin" aria-hidden="true"></span><span class="label">${button.label}</span></button>`;

export const postButton = (
  action: string,
  options: Button & { readonly confirm?: string; readonly fields?: Part },
) =>
  html`<form class="inline" method="post" action="${action}"${
    options.confirm === undefined ? '' : html` data-confirm="${options.confirm}"`
  }>${options.fields ?? ''}${button(options)}</form>`;

export const linkButton = (href: string, options: Button) =>
  html`<a class="${buttonClass(options)}" href="${href}">${options.label}</a>`;

export const cloudflareButton = (href: string, label = 'Sign in with Cloudflare') =>
  html`<a class="btn cf" href="${href}" data-sign-in="cloudflare"><img class="cf-mark" src="/brand/cloudflare-cloud.svg" alt="" width="33" height="15"><span>${label}</span></a>`;

export const notice = (tone: 'warn' | 'bad' | 'ok' | 'plain', body: Part) =>
  html`<div class="notice${tone === 'plain' ? '' : ` ${tone}`}" role="${tone === 'bad' ? 'alert' : 'status'}">${body}</div>`;

export const pageHead = (title: string, lead: Part, actions: Part = '') =>
  html`<div class="head"><div><h1>${title}</h1>${lead === '' ? '' : html`<p>${lead}</p>`}</div><div class="actions">${actions}</div></div>`;

export const copyField = (id: string, value: string, label: string) =>
  html`<div class="copy"><input id="${id}" readonly value="${value}" aria-label="${label}" onclick="this.select()"><button type="button" class="btn ghost" data-copy="${id}">Copy</button></div>`;

export const dollars = (usd: number) => (usd < 0.01 && usd > 0 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(3)}`);

export const seconds = (ms: number) =>
  ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${(ms / 60_000).toFixed(1)} min`;

export const when = (at: number) =>
  new Date(at).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });

export type ErrorPage = {
  readonly status: number;
  readonly title: string;
  readonly detail: Part;
  readonly viewer: Viewer;
  readonly actions?: Part;
};

export const errorPage = (error: ErrorPage) =>
  respond(
    {
      title: error.title,
      viewer: error.viewer,
      section: 'none',
      body: html`<div class="error"><div class="code">${error.status}</div><h1>${error.title}</h1><p>${error.detail}</p><div class="actions">${
        error.actions ?? [linkButton('/', { label: 'Go to the directory', kind: 'ghost' })]
      }</div></div>`,
    },
    error.status,
  );

export const notFound = (viewer: Viewer, what = 'This page') =>
  errorPage({
    status: 404,
    title: 'Not found',
    detail: `${what} does not exist, or it belongs to a different sign-in.`,
    viewer,
    actions: [
      linkButton('/', { label: 'Go to the directory', kind: 'ghost' }),
      viewer === null ? '' : linkButton('/installs', { label: 'Your installs' }),
    ],
  });

export const page = (layout: Layout, status = 200) => respond(layout, status);
