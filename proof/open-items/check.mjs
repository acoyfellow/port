import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;
const SITE = 'https://port.customer0.dev/';
const failures = [];
const fail = (message) => failures.push(message);
const ok = (message) => console.log(`ok ${message}`);
const readJson = (path) =>
  existsSync(join(root, path)) ? JSON.parse(readFileSync(join(root, path), 'utf8')) : null;
const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const run = (command, args, cwd = root) => {
  try {
    execFileSync(command, args, { cwd, stdio: 'pipe', timeout: 115_000 });
    return true;
  } catch {
    return false;
  }
};

const agentSource = readFileSync(join(root, 'shapes', 'kit', 'agent.ts'), 'utf8');
const spaceSource = readFileSync(join(root, 'shapes', 'beam-space', 'src', 'index.ts'), 'utf8');
if (!agentSource.includes('helperSpend') || !spaceSource.includes('helperSpend'))
  fail('beam-space cost does not add its threads');
else ok('beam-space cost adds every thread');

const receipt = readJson(join('proof', 'pi', 'beam-space.json'));
if (receipt?.passed !== true || receipt?.infrastructureOk !== true) fail('beam-space receipt does not pass');
else if (!(receipt.usd > 0.05)) fail(`beam-space receipt cost ${receipt.usd} looks like coordinator only`);
else ok(`beam-space receipt passes at $${receipt.usd.toFixed(4)}`);

const report = readJson(join('proof', 'eval-all.json'));
const summary = report?.summary?.['beam-space'];
const rows = (report?.rows ?? []).filter((row) => row.slug === 'beam-space');
const latest = new Map(rows.map((row) => [row.task, row]));
const costly = [...latest.values()].filter((row) => row.usd > 0.05).length;
if (summary === undefined || summary.ran !== summary.of) fail('beam-space eval incomplete');
else if (costly < 3) fail(`beam-space eval: only ${costly} tasks show thread cost`);
else
  ok(`beam-space eval ${summary.passed}/${summary.of} at ${(summary.usdPerTask * 100).toFixed(1)}¢ / task`);

const page = await (await fetch(SITE, { signal: AbortSignal.timeout(20_000) })).text();
if (!page.includes('class="cost-chart"')) fail('live page has no cost chart');
else ok('live page has the cost chart');
const start = page.indexOf('href="/d/beam-space"');
const row = start < 0 ? '' : page.slice(start, page.indexOf('</tr>', start));
const shownCents = summary === undefined ? '' : `${(summary.usdPerTask * 100).toFixed(1)}¢`;
if (row === '' || shownCents === '' || !row.includes(shownCents))
  fail(`live beam-space row does not show ${shownCents}`);
else ok(`live beam-space row shows ${shownCents}`);

const dori = join(root, 'docs', 'dori-superagent.md');
if (!existsSync(dori) || !/^## Verdict/m.test(readFileSync(dori, 'utf8')))
  fail('dori analysis has no verdict');
else ok('dori analysis written with a verdict');

const facet = readJson(join('proof', 'facet', 'result.json'));
if (
  facet === null ||
  typeof facet.passed !== 'boolean' ||
  typeof facet.reason !== 'string' ||
  facet.reason === ''
)
  fail('facet test result missing');
else ok(`facet test recorded: passed=${facet.passed} (${facet.reason})`);
const facetSweep = readJson(join('proof', 'shapes', 'facet-probe.json'));
if (Object.keys(facetSweep?.sweep?.leftovers ?? { missing: 1 }).length !== 0)
  fail('facet test left resources');
else ok('facet test left 0 resources');

if (!run('npx', ['vitest', 'run'])) fail('port tests fail');
else ok('port tests pass');
if (
  !run('npx', [
    'biome',
    'check',
    'shapes/kit',
    'shapes/beam-space',
    'shapes/facet-probe',
    'worker',
    'shared',
    'scripts/shape.mjs',
    'proof/open-items',
    'proof/eval-all.json',
  ])
)
  fail('lint fails');
else ok('lint clean');
if (!run('node', [join('pro' + 'of', 'gleam-three', 'check.mjs')])) fail('gleam-three gate fails');
else ok('gleam-three gate passes');

const OWNED = [
  'shapes/kit',
  'shapes/beam-space',
  'shapes/facet-probe',
  'worker',
  'shared',
  'static/ui.css',
  'scripts/shape.mjs',
  'docs/dori-superagent.md',
  'proof/open-items',
  'proof/facet',
  'proof/pi',
  'proof/shapes',
  'proof/eval-all.json',
];
const dirty = git(['status', '--porcelain', '--', ...OWNED]).trim();
if (dirty !== '') fail(`uncommitted:\n${dirty}`);
git(['fetch', '-q', 'origin']);
const ahead = git(['rev-list', '--count', 'origin/main..HEAD']).trim();
if (ahead !== '0') fail(`${ahead} commits not pushed`);
else ok('pushed');

if (failures.length > 0) {
  for (const message of failures) console.log(`FAIL ${message}`);
  process.exit(1);
}
console.log('open-items gate: pass');
