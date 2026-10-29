import { FLEET_VERSION } from '../generated/fleet-bundle';
import type { Install } from '../install';
import { accountPage, accountPickerPage, linkPage, signInPage } from './auth';
import { fleetPage, homePage } from './directory';
import { html } from './html';
import { cliKeyPage, type InstallView, installPage, installsPage, type RunTask, runPage } from './installs';
import { errorPage, linkButton, notFound, page } from './parts';

const VIEWER = { email: 'ada@example.com', accountName: "Ada's Account" };

const HOUR = 3_600_000;

const NOW = Date.UTC(2026, 9, 29, 16, 0);

const resources = (id: string, teardown?: boolean): Install['resources'] => [
  {
    kind: 'ai-gateway',
    name: `port-fleet-${id}`,
    existsAfterInstall: true,
    existsAfterTeardown: teardown === undefined ? undefined : !teardown,
  },
  {
    kind: 'worker',
    name: `port-fleet-${id}`,
    existsAfterInstall: true,
    existsAfterTeardown: teardown === undefined ? undefined : !teardown,
  },
];

const install = (
  id: string,
  state: Install['state'],
  hoursAgo: number,
  extra: Partial<InstallView> = {},
): InstallView => ({
  id,
  entry: 'fleet',
  createdAt: NOW - hoursAgo * HOUR,
  accountId: '0123456789abcdef0123456789abcdef',
  resources: resources(id, state === 'removed' ? true : undefined),
  url: `https://port-fleet-${id}.example.workers.dev`,
  key: 'preview',
  fleetVersion: FLEET_VERSION,
  state,
  log: [`created AI Gateway port-fleet-${id}`, `uploaded Worker port-fleet-${id}`],
  receipt: '761b55945c2886a2cd9bcea39aaf26f1',
  runs: [],
  ...extra,
});

const RUN = { id: 'a1b2c3', model: '@cf/moonshotai/kimi-k2.7-code', startedAt: NOW - 4 * 60_000 };

const task = (
  name: string,
  state: string,
  passed: boolean | null,
  turns: number,
  usd: number,
  ms: number,
): RunTask => ({
  task: name,
  state,
  turns,
  usd,
  ms,
  startedAt: NOW - ms,
  passed,
  hidden: passed === null ? null : { passed: passed ? 3 : 1, total: 3 },
  error: null,
});

const FINISHED: readonly RunTask[] = [
  task('business-days', 'done', true, 11, 0.0164, 69_000),
  task('cart-merge', 'done', true, 10, 0.0237, 99_000),
  task('csv-parse', 'done', true, 7, 0.0276, 120_000),
  task('money-words', 'done', true, 10, 0.0194, 71_000),
  {
    ...task('sku-glob', 'failed', false, 1, 0.0009, 156_000),
    error: 'The model call did not answer in 90 seconds.',
  },
];

const RUNNING: readonly RunTask[] = FINISHED.map((each, index) =>
  index < 2 ? each : { ...each, state: 'running', passed: null, hidden: null, error: null, ms: 0 },
);

const live = install('6360cded', 'installed', 2, { runs: [RUN] });

const SCREENS = {
  home: () => homePage(null),
  'home-signed-in': () => homePage(VIEWER),
  fleet: () => fleetPage(null),
  'sign-in': () => signInPage('/installs'),
  'sign-in-link': () => linkPage('https://dash.cloudflare.com/oauth2/auth?client_id=preview&state=preview'),
  'pick-account': () =>
    accountPickerPage(VIEWER, [
      { id: '0123456789abcdef0123456789abcdef', name: "Ada's Account" },
      { id: 'fedcba9876543210fedcba9876543210', name: 'Analytical Engines Ltd' },
    ]),
  account: () =>
    accountPage(VIEWER, {
      email: VIEWER.email,
      accountName: VIEWER.accountName,
      accountId: '0123456789abcdef0123456789abcdef',
      scopes: ['workers-scripts.admin', 'ai.read', 'aig.write', 'aig.run'],
    }),
  'installs-empty': () => installsPage(VIEWER, []),
  installs: () =>
    installsPage(VIEWER, [
      live,
      install('11bd2ee8', 'failed', 3, { resources: resources('11bd2ee8').slice(0, 1), url: null }),
      install('c3d3df20', 'installed', 30, { fleetVersion: 'old' }),
      install('c1254cef', 'removed', 50),
    ]),
  install: () => installPage(VIEWER, live),
  'install-failed': () =>
    installPage(
      VIEWER,
      install('11bd2ee8', 'failed', 3, { resources: resources('11bd2ee8').slice(0, 1), url: null }),
    ),
  'install-removed': () => installPage(VIEWER, install('c1254cef', 'removed', 50, { runs: [RUN] })),
  'run-live': () => runPage(VIEWER, live, RUN, RUNNING, NOW),
  run: () => runPage(VIEWER, live, RUN, FINISHED, NOW),
  'cli-key': () => cliKeyPage(VIEWER, 'portcli.preview-key-not-real', 'http://localhost:8787'),
  'not-found': () => notFound(VIEWER, 'This install'),
  error: () =>
    errorPage({
      status: 500,
      title: 'Something broke',
      detail: 'port hit an error it did not expect. Nothing on your account changed because of this page.',
      viewer: null,
    }),
} as const;

export const previewNames = Object.keys(SCREENS);

const isScreen = (name: string): name is keyof typeof SCREENS => name in SCREENS;

const index = () =>
  page({
    title: 'Preview',
    viewer: VIEWER,
    section: 'none',
    body: html`<h1>Preview</h1><p class="muted" style="margin:6px 0 20px">Every page with fixture data. Only when PREVIEW is on, in local dev.</p><div class="grid">${previewNames.map(
      (name) => linkButton(`/_preview/${name}`, { label: name, kind: 'ghost' }),
    )}</div>`,
  });

export const previewRoute = (enabled: boolean, url: URL): Response | null => {
  if (!enabled) return null;
  if (url.pathname === '/_preview') return index();
  const name = url.pathname.startsWith('/_preview/') ? url.pathname.slice('/_preview/'.length) : null;
  return name !== null && isScreen(name) ? SCREENS[name]() : null;
};
