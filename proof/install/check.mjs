import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;
const CUSTOMER_0 = process.env.PORT_TEST_ACCOUNT ?? '';
const DAY_MS = 24 * 60 * 60 * 1000;
const failures = [];
const fail = (message) => failures.push(message);

const generated = readFileSync(join(root, 'shared', 'entries', 'index.ts'), 'utf8');
const listed = [...generated.matchAll(/from '\.\.\/\.\.\/shapes\/([a-z0-9-]+)\/shape'/g)].map(
  (match) => match[1],
);
if (listed.length === 0) fail('no listed shapes found in shared/entries/index.ts');

for (const slug of listed) {
  const file = join(root, 'proof', 'install', `${slug}.json`);
  if (!existsSync(file)) {
    fail(`${slug}: no button-install receipt`);
    continue;
  }
  const receipt = JSON.parse(readFileSync(file, 'utf8'));
  const problems = [];
  if (Date.now() - Date.parse(receipt.at) > DAY_MS) problems.push('older than 24 hours');
  if (typeof receipt.account !== 'string' || receipt.account === CUSTOMER_0)
    problems.push('not installed on a user account');
  if (!String(receipt.via ?? '').includes('/installs/shapes/'))
    problems.push('not installed through the port button route');
  if (receipt.installed !== true) problems.push('install failed');
  if (receipt.pi?.passed !== true) problems.push('Pi task did not pass');
  if (receipt.pi?.resumed !== true) problems.push('did not resume after the restart');
  if (receipt.pi?.install !== receipt.install) problems.push('Pi run is from another install');
  if (receipt.removed !== true) problems.push('tear down did not finish');
  const left = (receipt.resources ?? []).filter((resource) => resource.existsAfterTeardown !== false);
  if (left.length > 0) problems.push(`left behind: ${left.map((resource) => resource.kind).join(', ')}`);
  if ((receipt.resources ?? []).length === 0) problems.push('no resources recorded');
  if (problems.length > 0) fail(`${slug}: ${problems.join('; ')}`);
  else
    console.log(
      `ok ${slug}: ${receipt.resources.length} resources, $${Number(receipt.pi.usd).toFixed(4)}, ${receipt.seconds}s`,
    );
}

const table = readFileSync(join(root, 'worker', 'ui', 'directory-table.ts'), 'utf8');
if (/key: 'stage'/.test(table)) fail('the directory table still has a Stage column');

const run = (label, command, args) => {
  try {
    execFileSync(command, args, { cwd: root, stdio: 'pipe', encoding: 'utf8' });
  } catch (error) {
    fail(
      `${label} failed: ${String(error.stdout ?? '')
        .trim()
        .split('\n')
        .slice(-3)
        .join(' | ')}`,
    );
  }
};
run('tests', 'npx', ['vitest', 'run']);
run('lint', 'npx', ['biome', 'check', '.']);
run('typecheck', 'npx', ['tsc', '--noEmit', '-p', 'tsconfig.json']);

if (failures.length > 0) {
  for (const failure of failures) console.log(`FAIL ${failure}`);
  console.log(`install gate: FAIL (${failures.length})`);
  process.exit(1);
}
console.log(`install gate: PASS (${listed.length} shapes)`);
