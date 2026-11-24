import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateFleetReport } from '../../scripts/fleet-search/schema.mjs';

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

try {
  runTests('scripts/fleet-search');
  runTests('scripts/architecture-search');
  const budgetRoot = `${root}scripts/architecture-search/budget`;
  for (const command of [
    ['./node_modules/.bin/tsc', '-p', 'tsconfig.json'],
    ['./node_modules/.bin/vitest', 'run'],
  ]) {
    const budget = spawnSync(command[0], command.slice(1), { cwd: budgetRoot, stdio: 'inherit' });
    if (budget.status !== 0) throw new Error(`Budget model check failed: ${command.join(' ')}`);
  }
  const ownedPaths = [
    'scripts/fleet-search',
    'proof/fleet-search',
    'shapes/pull-fleet',
    'shapes/tiered-fleet',
    'shared/shape-installs.ts',
    'shapes/kit/stack.ts',
    'scripts/architecture-search/live-adapter.mjs',
  ];
  const runCmd = (cmd, args, cwd = root) => {
    const res = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
    if (res.status !== 0) throw new Error(`Command failed: ${cmd} ${args.join(' ')}`);
  };
  runCmd('./node_modules/.bin/tsc', ['--noEmit', '-p', 'tsconfig.json']);
  runCmd('./node_modules/.bin/tsc', ['--noEmit', '-p', 'tsconfig.json'], `${root}shapes`);
  runCmd('./node_modules/.bin/biome', ['check', ...ownedPaths]);
  const status = spawnSync('git', ['status', '--porcelain', '--', ...ownedPaths], {
    cwd: root,
    encoding: 'utf8',
  });
  if (status.status !== 0 || status.stdout.trim() !== '')
    throw new Error(`Owned files have uncommitted changes:\n${status.stdout.trim()}`);
  const report = JSON.parse(readFileSync(new URL('./report.json', import.meta.url), 'utf8'));
  const summary = validateFleetReport(report);
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
