import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;
const DAY_MS = 24 * 60 * 60 * 1000;
const SITE = 'https://port.customer0.dev';
const failures = [];
const fail = (message) => failures.push(message);

const SHAPES = {
  'scheduled-agent': (f) => [
    [Number(f.scheduledRuns) >= 2, `only ${f.scheduledRuns} scheduled runs`],
    [Number(f.loggedTicks) >= 2, `only ${f.loggedTicks} tick lines written by Pi`],
  ],
  'workflow-plan': (f) => [
    [f.workflow === 'complete', `workflow ended ${f.workflow}`],
    [Number(f.completedSteps) === Number(f.planSteps) && Number(f.planSteps) > 0, 'not every step finished'],
    [Number(f.failedOnPurpose) === 1 && f.retriedStep === true, 'the failed step was not retried'],
    [Number(f.maxRunsPerStep) === 1, 'a step ran its work twice'],
  ],
  'vector-memory': (f) => [
    [Number(f.firstStored) >= 2, 'session A stored too few facts'],
    [f.firstSession !== f.secondSession, 'the second session is the same Durable Object'],
    [Number(f.secondStored) === 0, 'session B stored facts itself'],
    [Number(f.secondRecalledFromOther) >= 1, 'session B recalled nothing from session A'],
    [f.secondAnswerHasCode === true && f.secondAnswerHasDatabase === true, 'session B answered wrong'],
  ],
  'safe-sql': (f) => [
    [Number(f.piRefusals) >= 1, 'Pi was never refused'],
    [f.updateRefused === true && f.dropRefused === true, 'a direct write was not refused'],
    [Number(f.customers) === 4 && Number(f.orders) === 7 && Number(f.cents) === 20950, 'the data changed'],
    [f.agentHasDatabase === false, 'the agent holds the database'],
  ],
  'flight-recorder': (f) => [
    [Number(f.piToolCalls) > 0, 'Pi made no tool calls'],
    [Number(f.recordedCalls) === Number(f.piToolCalls), `recorded ${f.recordedCalls} of ${f.piToolCalls}`],
    [f.agentHasRecorder === false, 'the agent can write the record'],
  ],
};

const installs = readFileSync(join(root, 'shared', 'shape-installs.ts'), 'utf8');

const fetchOk = async (url) => {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(20_000) })).ok;
  } catch {
    return false;
  }
};

for (const [slug, facts] of Object.entries(SHAPES)) {
  const problems = [];
  const file = join(root, 'proof', 'pi', `${slug}.json`);
  if (!existsSync(file)) {
    fail(`${slug}: no Pi receipt`);
    continue;
  }
  const receipt = JSON.parse(readFileSync(file, 'utf8'));
  if (Date.now() - Date.parse(receipt.at) > DAY_MS) problems.push('receipt older than 24 hours');
  if (receipt.agent !== 'pi-durable') problems.push('not stock Pi');
  if (receipt.passed !== true) problems.push('Pi task did not pass');
  if (receipt.resumed !== true) problems.push('did not resume after the restart');
  if (receipt.infrastructureOk !== true) problems.push('infrastructure claim failed');
  for (const [ok, message] of facts(receipt.facts ?? {})) if (!ok) problems.push(message);
  const run = join(root, 'proof', 'shapes', `${slug}.json`);
  const sweep = existsSync(run) ? JSON.parse(readFileSync(run, 'utf8')).sweep : undefined;
  if (sweep === undefined || Object.keys(sweep.leftovers ?? {}).length > 0)
    problems.push('no clean 0-left sweep');
  else if (Date.parse(sweep.at) < Date.parse(receipt.at)) problems.push('sweep is older than the Pi run');
  if (!installs.includes(`'${slug}'`)) problems.push('no install recipe');
  if (!(await fetchOk(`${SITE}/d/${slug}`))) problems.push('live page does not serve');
  if (problems.length > 0) fail(`${slug}: ${problems.join('; ')}`);
  else console.log(`ok ${slug}: ${receipt.infrastructure.slice(0, 220)}`);
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
const OWNED = [
  ...Object.keys(SHAPES).map((slug) => `shapes/${slug}`),
  'shapes/kit',
  'shared',
  'worker',
  'test',
  'scripts/bundle-fleet.mjs',
  'scripts/gen-entries.mjs',
  'proof/cf-five',
];
if (!run('npx', ['biome', 'check', ...OWNED])) fail('lint fails');

if (failures.length > 0) {
  for (const message of failures) console.log(`FAIL ${message}`);
  process.exit(1);
}
console.log('cf-five gate: all five pass');
