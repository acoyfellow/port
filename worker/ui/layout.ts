import { html, type Part, raw, renderHtml } from './html';

export type Viewer = { readonly email: string | null; readonly accountName: string | null } | null;

export type Section = 'home' | 'installs' | 'account' | 'none';

export type Crumb = { readonly label: string; readonly href?: string };

export type Layout = {
  readonly title: string;
  readonly viewer: Viewer;
  readonly section: Section;
  readonly crumbs?: readonly Crumb[];
  readonly refreshSeconds?: number;
  readonly body: Part;
};

const NAV: readonly { readonly section: Section; readonly label: string; readonly href: string }[] = [
  { section: 'home', label: 'Directory', href: '/' },
  { section: 'installs', label: 'Installs', href: '/installs' },
];

const navLinks = (current: Section, viewer: Viewer) =>
  html`<nav class="nav-links" aria-label="Main">${NAV.filter(
    (link) => link.section === 'home' || viewer !== null,
  ).map(
    (link) =>
      html`<a href="${link.href}"${link.section === current ? html` aria-current="page"` : ''}>${link.label}</a>`,
  )}</nav>`;

const viewerControls = (viewer: Viewer) =>
  viewer === null
    ? html`<a class="btn small" href="/sign-in">Sign in</a>`
    : html`<a class="who row-link" href="/account" title="Account and sign out"><span class="who-mark" aria-hidden="true">${(viewer.email ?? '?').slice(0, 1).toUpperCase()}</span><span class="who-text"><span>${viewer.email ?? 'Signed in'}</span><small>${viewer.accountName ?? 'No account picked'}</small></span></a>`;

const crumbTrail = (crumbs: readonly Crumb[]) =>
  crumbs.length === 0
    ? ''
    : html`<nav class="crumbs" aria-label="Breadcrumb">${crumbs.map((crumb, index) => [
        index === 0 ? '' : html`<span aria-hidden="true">/</span>`,
        crumb.href === undefined
          ? html`<span aria-current="page">${crumb.label}</span>`
          : html`<a href="${crumb.href}">${crumb.label}</a>`,
      ])}</nav>`;

const BUSY_SCRIPT = `document.addEventListener('submit',(e)=>{const f=e.target;if(!(f instanceof HTMLFormElement))return;if(f.dataset.confirm&&!confirm(f.dataset.confirm)){e.preventDefault();return}if(f.classList.contains('busy')){e.preventDefault();return}f.classList.add('busy');for(const b of document.querySelectorAll('form button'))b.disabled=true;const b=f.querySelector('button[data-busy]');if(b){const label=b.querySelector('.label');if(label)label.textContent=b.dataset.busy}});document.addEventListener('click',(e)=>{const b=e.target instanceof Element?e.target.closest('[data-copy]'):null;if(!b)return;const input=document.getElementById(b.dataset.copy);if(!input)return;navigator.clipboard.writeText(input.value).then(()=>{b.textContent='Copied'})})`;

export const layout = (page: Layout): string =>
  `<!doctype html>${renderHtml(
    html`<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark">${
      page.refreshSeconds === undefined
        ? ''
        : html`<meta http-equiv="refresh" content="${page.refreshSeconds}">`
    }<title>${page.title} · port</title><meta name="description" content="Install agent infra on your own Cloudflare account, evaluate it, then keep it or tear it down."><link rel="icon" href="/brand/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/brand/apple-touch-icon.png"><link rel="manifest" href="/manifest.webmanifest"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght@6..144,300..700&amp;family=Google+Sans+Code:wght@400;500&amp;display=swap"><link rel="stylesheet" href="/ui.css"></head><body><div class="shell"><header class="nav"><div class="nav-inner"><a class="brand" href="/"><img src="/brand/favicon.svg" alt="">port</a>${navLinks(
      page.section,
      page.viewer,
    )}<div class="nav-end">${viewerControls(page.viewer)}</div></div></header><main class="main" id="main">${crumbTrail(
      page.crumbs ?? [],
    )}${page.body}</main><footer class="foot"><div class="foot-inner"><span>Everything port installs runs on your account and your bill.</span><span><a href="https://github.com/acoyfellow/port">Source</a></span></div></footer></div><script>${raw(BUSY_SCRIPT)}</script></body></html>`,
  )}`;

export const respond = (page: Layout, status = 200) =>
  new Response(layout(page), {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
