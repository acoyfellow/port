import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateTieredPullReport } from '../../scripts/fleet-search/tiered-pull-schema.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const runTests = (dir) => {
  const files = readdirSync(new URL(`../../${dir}/`, import.meta.url))
    .filter((name) => name.endsWith('.test.mjs'))
    .map((name) => `${dir}/${name}`);
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--test', ...files], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error(`Tests failed in ${dir}`);
};

const runCmd = (cmd, args, cwd = root) => {
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (res.status !== 0) throw new Error(`Command failed: ${cmd} ${args.join(' ')}`);
};

try {
  runTests('scripts/fleet-search');
  runTests('scripts/architecture-search');
  const budgetRoot = `${root}scripts/architecture-search/budget`;
  runCmd('./node_modules/.bin/tsc', ['-p', 'tsconfig.json'], budgetRoot);
  runCmd('./node_modules/.bin/vitest', ['run'], budgetRoot);
  runCmd('./node_modules/.bin/tsc', ['--noEmit', '-p', 'tsconfig.json']);
  runCmd('./node_modules/.bin/tsc', ['--noEmit', '-p', 'tsconfig.json'], `${root}shapes`);
  const ownedPaths = [
    'scripts/fleet-search',
    'proof/tiered-pull',
    'proof/fleet-search',
    'shapes/tiered-pull-fleet',
    'shared/shape-installs.ts',
  ];
  runCmd('./node_modules/.bin/biome', ['check', '--error-on-warnings', ...ownedPaths]);
  const status = spawnSync('git', ['status', '--porcelain', '--', ...ownedPaths], {
    cwd: root,
    encoding: 'utf8',
  });
  if (status.status !== 0 || status.stdout.trim() !== '')
    throw new Error(`Owned files have uncommitted changes:\n${status.stdout.trim()}`);
  const report = JSON.parse(readFileSync(new URL('./report.json', import.meta.url), 'utf8'));
  const summary = validateTieredPullReport(report);
  console.log('TIERED-PULL-GATE-PASS', JSON.stringify(summary));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
