import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { missingPiPages } from './pages.mjs';

const root = join(import.meta.dirname, '..', '..');
const shapesDir = join(root, 'shapes');
const DAY_MS = 24 * 60 * 60 * 1000;
const WORKFLOW = 'pi-pages.yml';

const shapes = readdirSync(shapesDir).filter((name) => existsSync(join(shapesDir, name, 'shape.ts')));
const failures = [];
const passes = [];
const check = (name, ok, detail) => (ok ? passes : failures).push(`${name}: ${detail}`);

const receiptOf = (slug) => {
  const file = join(root, 'proof', 'pi', `${slug}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
};
const sweepOf = (slug) => {
  const file = join(root, 'proof', 'shapes', `${slug}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
};

for (const slug of shapes) {
  const receipt = receiptOf(slug);
  if (receipt === null) {
    check(`receipt ${slug}`, false, 'no proof/pi receipt');
    continue;
  }
  const age = Date.now() - Date.parse(receipt.at);
  const shape = sweepOf(slug);
  const tornDown =
    shape?.down?.ok === true &&
    shape?.sweep !== undefined &&
    Object.keys(shape.sweep.leftovers ?? {}).length === 0 &&
    Date.parse(shape.sweep.at) >= Date.parse(receipt.at);
  const problems = [
    age < DAY_MS ? '' : `older than 24 h (${receipt.at})`,
    receipt.agent === 'pi-durable' ? '' : 'agent is not pi-durable',
    receipt.passed === true ? '' : 'task did not pass',
    receipt.restarted === true && receipt.resumed === true ? '' : 'mid-task restart did not resume',
    typeof receipt.usd === 'number' && receipt.usd > 0 ? '' : 'no Pi usage cost',
    receipt.infrastructureOk === true ? '' : 'infrastructure check failed',
    tornDown ? '' : 'not torn down after the run',
  ].filter(Boolean);
  check(
    `receipt ${slug}`,
    problems.length === 0,
    problems.join('; ') || `$${receipt.usd.toFixed(4)}, ${receipt.seconds} s`,
  );
}

const tracked = execFileSync('git', ['ls-files', 'shapes'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter((path) => path !== '' && !path.includes('node_modules'));
const modelFiles = tracked.filter((path) => path.endsWith('/model.ts'));
check('no model.ts', modelFiles.length === 0, modelFiles.join(', ') || 'none');
const handLoop = /callModel|\/v1\/messages|chat\/completions|tool_use|while \(outcome\.turns/;
const loops = tracked.filter(
  (path) =>
    /\.(ts|mjs)$/.test(path) &&
    !path.includes('/test/') &&
    handLoop.test(readFileSync(join(root, path), 'utf8')),
);
check('no hand agent loop', loops.length === 0, loops.join(', ') || 'none');
const notPi = shapes.filter((slug) => {
  const source = join(shapesDir, slug, 'src', 'index.ts');
  return !existsSync(source) || !readFileSync(source, 'utf8').includes('piAgent');
});
check('every shape on the Pi kit', notPi.length === 0, notPi.join(', ') || 'all use piAgent');

const run = (name, command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 100_000 });
  const tail = `${result.stdout}${result.stderr}`.trim().split('\n').slice(-3).join(' | ');
  check(name, result.status === 0, result.status === 0 ? 'passed' : tail.slice(0, 400));
};
run('env conformance', 'npx', ['vitest', 'run', 'shapes/kit/test'], root);
run('port tests', 'npx', ['vitest', 'run'], root);
run('lint', 'npx', ['biome', 'check', '.'], root);
run('shapes typecheck', 'npx', ['tsc', '--noEmit', '-p', 'tsconfig.json'], shapesDir);

const latestGithubRun = () => {
  const result = spawnSync(
    'gh',
    ['run', 'list', '--workflow', WORKFLOW, '--limit', '1', '--json', 'conclusion,createdAt,headSha,url'],
    { cwd: root, encoding: 'utf8', timeout: 30_000 },
  );
  if (result.status !== 0) return null;
  const [latest] = JSON.parse(result.stdout);
  return latest ?? null;
};

if (process.env.PORT_PROD === '1') {
  const missing = await missingPiPages(shapes);
  check(
    'prod pages',
    missing.length === 0,
    missing.join(', ') || `${shapes.length} pages show the Pi logo and tech section`,
  );
} else {
  const latest = latestGithubRun();
  const fresh = latest !== null && Date.now() - Date.parse(latest.createdAt) < DAY_MS;
  check(
    'prod pages (GitHub runner)',
    fresh && latest.conclusion === 'success',
    latest === null
      ? `no ${WORKFLOW} run found`
      : `${latest.conclusion || 'running'} at ${latest.createdAt} ${latest.url}`,
  );
}

for (const line of passes) console.log(`ok   ${line}`);
for (const line of failures) console.log(`FAIL ${line}`);
console.log(failures.length === 0 ? 'check: PASS' : `check: ${failures.length} failing`);
process.exit(failures.length === 0 ? 0 : 1);
