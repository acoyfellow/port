import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;
const SITE = 'https://port.customer0.dev/';
const SHAPES = ['write-list', 'beam-fleet', 'beam-space'];
const failures = [];
const fail = (message) => failures.push(message);
const ok = (message) => console.log(`ok ${message}`);

const readJson = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);
const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });

const claims = {
  'write-list': (facts) =>
    Number(facts.refusals) >= 2 &&
    String(facts.refusedPaths).includes('README.md') &&
    String(facts.refusedPaths).includes('package.json'),
  'beam-fleet': (facts) =>
    facts.supervisor === 'one_for_one' &&
    facts.neighbourDenied === true &&
    Number(facts.killedStartsAfter) === Number(facts.killedStartsBefore) + 1 &&
    Number(facts.otherSeatsRestarted) === 0 &&
    Number(facts.neighboursPassed) >= 2,
  'beam-space': (facts) =>
    Number(facts.workers) >= 3 &&
    Number(facts.checkers) >= 3 &&
    Number(facts.restartedThreads) === 0 &&
    String(facts.summary).trim() !== '',
};

const report = readJson(join(root, 'proof', 'eval-all.json'));
for (const slug of SHAPES) {
  const receipt = readJson(join(root, 'proof', 'pi', `${slug}.json`));
  const sweep = readJson(join(root, 'proof', 'shapes', `${slug}.json`));
  if (receipt === null) {
    fail(`${slug}: no Pi receipt`);
    continue;
  }
  const problems = [
    receipt.agent === 'pi-durable' ? '' : 'agent is not pi-durable',
    receipt.passed === true ? '' : 'task did not pass',
    receipt.resumed === true ? '' : 'did not resume after the forced restart',
    receipt.infrastructureOk === true ? '' : 'infrastructure check failed',
    claims[slug](receipt.facts ?? {}) ? '' : 'shape claim does not hold in the receipt facts',
    sweep?.down?.ok === true && Object.keys(sweep?.sweep?.leftovers ?? { missing: 1 }).length === 0
      ? ''
      : 'sweep did not confirm 0 left',
  ].filter(Boolean);
  if (problems.length > 0) fail(`${slug}: ${problems.join('; ')}`);
  else ok(`${slug}: receipt and claim hold, 0 left`);
  const summary = report?.summary?.[slug];
  if (summary === undefined || summary.ran !== summary.of) fail(`${slug}: coding eval did not run all tasks`);
  else ok(`${slug}: coding eval ${summary.passed}/${summary.of}`);
}

const page = await (await fetch(SITE, { signal: AbortSignal.timeout(20_000) })).text();
for (const slug of SHAPES) {
  const summary = report?.summary?.[slug];
  const start = page.indexOf(`href="/d/${slug}"`);
  const row = start < 0 ? '' : page.slice(start, page.indexOf('</tr>', start));
  if (row === '') fail(`${slug}: not on the live directory`);
  else if (summary === undefined || !row.includes(`${summary.passed}/${summary.of}`))
    fail(`${slug}: live row does not show its coding eval score`);
  else ok(`${slug}: live with ${summary.passed}/${summary.of}`);
}

const run = (command, args, cwd = root) => {
  try {
    execFileSync(command, args, { cwd, stdio: 'pipe', timeout: 110_000 });
    return true;
  } catch {
    return false;
  }
};
if (!run('npx', ['vitest', 'run'])) fail('port tests fail');
else ok('port tests pass');
if (!run('gleam', ['test'], join(root, 'shapes', 'kit', 'box', 'beam'))) fail('gleam supervisor tests fail');
else ok('gleam supervisor tests pass');
if (
  !run('npx', [
    'biome',
    'check',
    'shapes/kit',
    'shapes/write-list',
    'shapes/beam-fleet',
    'shapes/beam-space',
    'shared',
    'worker',
    'test',
    'scripts/eval-all.mjs',
    'scripts/gen-entries.mjs',
    'scripts/shape.mjs',
    'proof/eval-all.json',
    'proof/gleam-three',
  ])
)
  fail('lint fails');
else ok('lint clean');

const dirty = git([
  'status',
  '--porcelain',
  '--',
  'shapes',
  'shared',
  'worker',
  'scripts',
  'proof',
  'test',
]).trim();
if (dirty !== '') fail(`uncommitted changes:\n${dirty}`);
git(['fetch', '-q', 'origin']);
const ahead = git(['rev-list', '--count', 'origin/main..HEAD']).trim();
if (ahead !== '0') fail(`${ahead} commits not pushed`);

if (failures.length > 0) {
  for (const message of failures) console.log(`FAIL ${message}`);
  process.exit(1);
}
console.log('gleam-three gate: pass');
