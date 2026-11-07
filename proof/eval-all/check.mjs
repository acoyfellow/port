import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;
const SITE = 'https://port.customer0.dev/';
const HANDOFF_FILES = [
  'proof/eval-all.json',
  'scripts/eval-all.mjs',
  'scripts/gen-entries.mjs',
  'shapes/kit/agent.ts',
  'shapes/kit/router.ts',
  'shapes/kit/box/env-server.mjs',
  'shapes/shared-container/src/index.ts',
  'shared/entry.ts',
  'shared/entries/index.ts',
  'worker/ui/directory-table.ts',
  'worker/ui/directory.ts',
  'static/ui.css',
  'worker/generated/fleet-bundle.ts',
];
const failures = [];

const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const dirty = git(['status', '--porcelain', '--', ...HANDOFF_FILES]).trim();
if (dirty !== '') failures.push(`uncommitted handoff files:\n${dirty}`);

const report = JSON.parse(readFileSync(join(root, 'proof', 'eval-all.json'), 'utf8'));
const scored = Object.entries(report.summary).filter(
  ([, summary]) => summary.ran > 0 && typeof summary.passed === 'number',
);
if (scored.length < 10) failures.push(`only ${scored.length} scored shapes in eval-all.json`);

const page = await (await fetch(SITE, { signal: AbortSignal.timeout(20_000) })).text();
if (!page.includes('Coding eval')) failures.push('live page has no Coding eval column');
if (page.includes('AI cost / run')) failures.push('live page still shows the old AI cost / run column');
for (const [slug, summary] of scored) {
  const start = page.indexOf(`href="/d/${slug}"`);
  const row = start < 0 ? '' : page.slice(start, page.indexOf('</tr>', start));
  if (row === '') failures.push(`${slug}: no row on the live page`);
  else if (!row.includes(`${summary.passed}/${summary.of}`))
    failures.push(`${slug}: live row does not show ${summary.passed}/${summary.of}`);
  else console.log(`ok ${slug}: ${summary.passed}/${summary.of}`);
}

const run = (command, args) => {
  try {
    execFileSync(command, args, { cwd: root, stdio: 'pipe', timeout: 110_000 });
    return true;
  } catch {
    return false;
  }
};
if (!run('npx', ['vitest', 'run'])) failures.push('port tests fail');
if (
  !run('npx', [
    'biome',
    'check',
    'shapes/kit',
    'shapes/shared-container',
    'shared',
    'worker',
    'test',
    'scripts/eval-all.mjs',
    'scripts/gen-entries.mjs',
    'proof/eval-all.json',
    'proof/eval-all',
  ])
)
  failures.push('lint fails');

if (failures.length > 0) {
  for (const message of failures) console.log(`FAIL ${message}`);
  process.exit(1);
}
console.log('eval-all gate: pass');
