import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;
const SITE = 'https://port.customer0.dev/';
const SLUG = 'nix-git';
const failures = [];
const fail = (message) => failures.push(message);
const ok = (message) => console.log(`ok ${message}`);
const readJson = (...parts) => {
  const path = join(root, ...parts);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
};
const run = (command, args) => {
  try {
    execFileSync(command, args, { cwd: root, stdio: 'pipe', timeout: 115_000 });
    return true;
  } catch {
    return false;
  }
};

const receipt = readJson('pro' + 'of', 'pi', `${SLUG}.json`);
const facts = receipt?.facts ?? {};
const receiptProblems = [
  receipt?.agent === 'pi-durable' ? '' : 'agent is not pi-durable',
  receipt?.passed === true ? '' : 'task did not pass',
  receipt?.resumed === true ? '' : 'did not resume after the forced restart',
  receipt?.infrastructureOk === true ? '' : 'infrastructure check failed',
  Number(facts.forcePushForms) === 6 && Number(facts.forcePushRefused) === 6
    ? ''
    : 'not 6 of 6 force pushes refused',
  facts.remote === 'unchanged' ? '' : 'remote branch moved',
  facts.normalPush === 'ok' ? '' : 'normal push did not work',
  facts.gitIsNix === true && String(facts.gitStorePath).startsWith('/nix/store/')
    ? ''
    : 'git is not the Nix build',
].filter(Boolean);
if (receipt === null) fail('no Pi receipt');
else if (receiptProblems.length > 0) fail(receiptProblems.join('; '));
else ok(`receipt: 6/6 force pushes refused, normal push ok, git ${facts.gitStorePath}`);

const sweep = readJson('pro' + 'of', 'shapes', `${SLUG}.json`);
if (sweep?.down?.ok !== true || Object.keys(sweep?.sweep?.leftovers ?? { missing: 1 }).length !== 0)
  fail('sweep did not confirm 0 left');
else ok('sweep: 0 left');

const report = readJson('pro' + 'of', 'eval-all.json');
const summary = report?.summary?.[SLUG];
if (summary === undefined || summary.ran !== summary.of) fail('coding eval did not run all tasks');
else ok(`coding eval ${summary.passed}/${summary.of}`);

const page = await (await fetch(SITE, { signal: AbortSignal.timeout(20_000) })).text();
const start = page.indexOf(`href="/d/${SLUG}"`);
const row = start < 0 ? '' : page.slice(start, page.indexOf('</tr>', start));
if (row === '') fail('not on the live directory');
else if (summary === undefined || !row.includes(`${summary.passed}/${summary.of}`))
  fail('live row does not show its coding eval score');
else ok(`live with ${summary.passed}/${summary.of}`);

if (!run('npx', ['vitest', 'run'])) fail('port tests fail');
else ok('port tests pass');
if (
  !run('npx', [
    'biome',
    'check',
    'shapes/nix-git',
    'shapes/kit',
    'shared',
    'worker',
    'scripts/shape.mjs',
    'scripts/gen-entries.mjs',
    'scripts/eval-all.mjs',
    'proof/nix-git',
    'proof/eval-all.json',
  ])
)
  fail('lint fails');
else ok('lint clean');

const OWNED = [
  'shapes/nix-git',
  'shapes/kit',
  'shared',
  'worker',
  'scripts/shape.mjs',
  'scripts/gen-entries.mjs',
  'scripts/eval-all.mjs',
  'proof/nix-git',
  'proof/pi',
  'proof/shapes',
  'proof/eval-all.json',
];
const dirty = execFileSync('git', ['status', '--porcelain', '--', ...OWNED], {
  cwd: root,
  encoding: 'utf8',
}).trim();
if (dirty !== '') fail(`uncommitted:\n${dirty}`);
else ok('committed');

if (failures.length > 0) {
  for (const message of failures) console.log(`FAIL ${message}`);
  process.exit(1);
}
console.log('nix-git gate: pass');
