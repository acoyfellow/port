import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { frontier, validateReceipt } from '../../scripts/architecture-search/core.mjs';
import { verifyArtifact } from '../../scripts/architecture-search/evidence.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
try {
  const testFiles = readdirSync(new URL('../../scripts/architecture-search/', import.meta.url))
    .filter((name) => name.endsWith('.test.mjs'))
    .map((name) => `scripts/architecture-search/${name}`);
  const tests = spawnSync(process.execPath, ['--experimental-strip-types', '--test', ...testFiles], {
    cwd: root,
    stdio: 'inherit',
  });
  if (tests.status !== 0) throw new Error('Deterministic tests failed');
  const budgetRoot = `${root}scripts/architecture-search/budget`;
  for (const command of [
    ['./node_modules/.bin/tsc', '-p', 'tsconfig.json'],
    ['./node_modules/.bin/vitest', 'run'],
  ]) {
    const budget = spawnSync(command[0], command.slice(1), { cwd: budgetRoot, stdio: 'inherit' });
    if (budget.status !== 0) throw new Error(`Budget model check failed: ${command.join(' ')}`);
  }
  const report = JSON.parse(readFileSync(new URL('./report.json', import.meta.url), 'utf8'));
  if (!Array.isArray(report.receipts) || report.receipts.length < 3)
    throw new Error('Need baseline and two configuration receipts');
  let measuredUsd = 0;
  for (const receipt of report.receipts) {
    validateReceipt(receipt);
    const deployment = await verifyArtifact(root, receipt.deployment);
    if (!deployment.versionId || deployment.configurationDigest !== receipt.configurationDigest)
      throw new Error('Deployment does not match configuration');
    const inventory = await verifyArtifact(root, receipt.cleanup.artifact);
    if (!Array.isArray(inventory.remaining) || inventory.remaining.length !== 0)
      throw new Error('Resources remain');
    for (const trial of receipt.trials) {
      const grade = await verifyArtifact(root, trial.gradeArtifact);
      const billing = await verifyArtifact(root, trial.costArtifact);
      if (grade.trialId !== trial.id || grade.accepted !== trial.accepted)
        throw new Error('Independent grade mismatch');
      if (billing.trialId !== trial.id || JSON.stringify(billing.cost) !== JSON.stringify(trial.cost))
        throw new Error('Billing mismatch');
      measuredUsd += Object.values(trial.cost).reduce((sum, value) => sum + value, 0);
    }
  }
  if (new Set(report.receipts.map((receipt) => receipt.configurationDigest)).size < 3)
    throw new Error('Need three distinct configurations');
  if (
    report.totalUsd > 20 ||
    !Number.isFinite(report.totalUsd) ||
    Math.abs(report.totalUsd - measuredUsd) > 0.000001
  )
    throw new Error('Invalid campaign spend');
  console.log(JSON.stringify({ frontier: frontier(report.receipts) }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
