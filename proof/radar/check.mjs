import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;
const DAY_MS = 24 * 60 * 60 * 1000;
const SITE = 'https://port.customer0.dev';
const failures = [];
const fail = (message) => failures.push(message);

const SHAPES = {
  'egress-filter': {
    paper: '2608.12172',
    facts: (f) => [
      [f.allowedReached === true, 'the allowed host was not reached'],
      [Number(f.canaryHits) === 0, `the canary got ${f.canaryHits} requests`],
      [Number(f.blocked) >= 1, 'no blocked request was recorded'],
      [Number(f.logged) >= Number(f.blocked) + 1, 'not every request was logged'],
      [f.sandboxBindings === '', `the sandbox had bindings: ${f.sandboxBindings}`],
    ],
  },
  'gadget-workspace': {
    paper: '2610.35835',
    facts: (f) => [
      [Number(f.pending) >= 1 || Number(f.delivered) >= 1, 'no action was queued'],
      [f.unsignedRefused === true, 'an unsigned approval was not refused'],
      [f.forgedRefused === true, 'a forged approval was not refused'],
      [f.wrongDigestRefused === true, 'a signature over another action was not refused'],
      [f.signedDelivered === true, 'a valid passkey signature did not deliver the action'],
      [f.workspaceHasKey === false, 'the workspace holds the delivery key'],
    ],
  },
  'snapshot-rollback': {
    paper: '2610.13841',
    facts: (f) => [
      [Number(f.snapshots) >= 1, 'no snapshot was taken'],
      [f.brokenBeforeRestore === true, 'the workspace was not broken before the restore'],
      [f.restoredMatches === true, 'the restored files do not match the snapshot'],
      [f.freshContainer === true, 'the restore did not start a fresh container'],
    ],
  },
};

const fetchText = async (url) => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    return response.ok ? await response.text() : '';
  } catch {
    return '';
  }
};

for (const [slug, rule] of Object.entries(SHAPES)) {
  const file = join(root, 'proof', 'pi', `${slug}.json`);
  if (!existsSync(file)) {
    fail(`${slug}: no Pi receipt`);
    continue;
  }
  const receipt = JSON.parse(readFileSync(file, 'utf8'));
  const problems = [];
  if (Date.now() - Date.parse(receipt.at) > DAY_MS) problems.push('receipt older than 24 hours');
  if (receipt.agent !== 'pi-durable') problems.push('not stock Pi');
  if (receipt.passed !== true) problems.push('Pi task did not pass');
  if (receipt.resumed !== true) problems.push('did not resume after the restart');
  if (receipt.infrastructureOk !== true) problems.push('infrastructure claim failed');
  for (const [ok, message] of rule.facts(receipt.facts ?? {})) if (!ok) problems.push(message);
  const run = join(root, 'proof', 'shapes', `${slug}.json`);
  const sweep = existsSync(run) ? JSON.parse(readFileSync(run, 'utf8')).sweep : undefined;
  if (sweep === undefined || Object.keys(sweep.leftovers ?? {}).length > 0)
    problems.push('no clean 0-left sweep');
  else if (Date.parse(sweep.at) < Date.parse(receipt.at)) problems.push('sweep is older than the Pi run');
  const shapeSource = readFileSync(join(root, 'shapes', slug, 'shape.ts'), 'utf8');
  if (!shapeSource.includes(`arxiv.org/abs/${rule.paper}`))
    problems.push(`entry does not link arXiv ${rule.paper}`);
  const page = await fetchText(`${SITE}/d/${slug}`);
  if (!page.includes(`arxiv.org/abs/${rule.paper}`))
    problems.push('live page missing or does not link the paper');
  if (problems.length > 0) fail(`${slug}: ${problems.join('; ')}`);
  else console.log(`ok ${slug}: ${receipt.infrastructure}`);
}

const run = (command, args) => {
  try {
    execFileSync(command, args, { cwd: root, stdio: 'pipe', timeout: 110_000 });
    return true;
  } catch {
    return false;
  }
};
if (!run('npx', ['vitest', 'run'])) fail('port tests fail');
if (!run('npx', ['biome', 'check', '.'])) fail('lint fails');

if (failures.length > 0) {
  for (const message of failures) console.log(`FAIL ${message}`);
  process.exit(1);
}
console.log('radar gate: all three pass');
