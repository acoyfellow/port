import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from './evidence.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

const writeArtifact = async (path, value) => {
  const text = JSON.stringify(value, null, 2);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
  return { path: relative(root, path), sha256: digest(text) };
};

const sha = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

export const buildReceipts = async ({ directory, pinsPath, experiments, benchmarkDigest }) => {
  const pins = await readJson(pinsPath);
  const receipts = [];
  let totalUsd = 0;
  for (const id of experiments) {
    const evaluation = await readJson(join(directory, `${id}.eval.json`));
    const projection = await readJson(join(directory, `${id}.projection.json`));
    const sweep = JSON.parse(await readFile(join(directory, `${id}-sweep.log`), 'utf8'));
    if (Object.keys(sweep.leftovers).length !== 0 || Object.keys(sweep.errors).length !== 0)
      throw new Error(`Resources remain after ${id}`);
    const rows = evaluation.rows;
    if (rows.length === 0) throw new Error(`No trials for ${id}`);
    const models = new Set(rows.map((row) => row.model));
    if (models.size !== 1) throw new Error(`Mixed models for ${id}`);
    const slug = id === 'search-lite-retry' ? 'search-lite' : id;
    const configurationDigest = sha({ slug, sources: pins.digest });
    const share = 1 / rows.length;
    const trials = [];
    for (const row of rows) {
      const grade = {
        trialId: `${id}:${row.task}`,
        accepted: row.passed === true,
        hidden: `${row.hiddenPassed}/${row.hiddenTotal}`,
        visible: `${row.visiblePassed}/${row.visibleTotal}`,
        reason: row.reason ?? '',
        capped: row.capped === true,
      };
      const cost = {
        ai: row.usd,
        compute: projection.cost.compute * share,
        storage: 0,
        requests: 0,
        idle: projection.cost.overhead * share,
      };
      const billing = {
        trialId: grade.trialId,
        cost,
        basis: projection.basis,
        limitations: projection.limitations,
      };
      const gradeArtifact = await writeArtifact(
        join(directory, 'artifacts', id, `${row.task}.grade.json`),
        grade,
      );
      const costArtifact = await writeArtifact(
        join(directory, 'artifacts', id, `${row.task}.cost.json`),
        billing,
      );
      trials.push({
        id: grade.trialId,
        task: row.task,
        elapsedMs: Math.max(1, Math.round(row.seconds * 1000)),
        accepted: grade.accepted,
        evidenceDigest: gradeArtifact.sha256,
        cost,
        gradeArtifact,
        costArtifact,
      });
      totalUsd += Object.values(cost).reduce((sum, value) => sum + value, 0);
    }
    const deployment = await writeArtifact(join(directory, 'artifacts', id, 'deployment.json'), {
      versionId: `${slug}@${pins.digest.slice(0, 12)}`,
      configurationDigest,
      sources: pins.digest,
    });
    const cleanup = await writeArtifact(join(directory, 'artifacts', id, 'cleanup.json'), {
      remaining: [],
      sweepAt: sweep.at,
      prefix: sweep.prefix,
    });
    receipts.push({
      version: 1,
      benchmarkDigest,
      configurationDigest,
      model: [...models][0],
      trials,
      deployment,
      cleanup: { remaining: 0, inventoryDigest: cleanup.sha256, artifact: cleanup },
    });
  }
  return { receipts, totalUsd };
};
