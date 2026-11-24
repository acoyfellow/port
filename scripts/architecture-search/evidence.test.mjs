import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { digest, maximumCost, verifyArtifact } from './evidence.mjs';

test('artifact verification rejects missing, substituted and external evidence', async () => {
  const directory = await mkdtemp(join(import.meta.dirname, '../../.tmp/evidence-'));
  try {
    const text = JSON.stringify({ accepted: true });
    await writeFile(join(directory, 'grade.json'), text);
    const artifact = { path: 'grade.json', sha256: digest(text) };
    assert.deepEqual(await verifyArtifact(directory, artifact), { accepted: true });
    await assert.rejects(verifyArtifact(directory, { ...artifact, path: '../grade.json' }));
    await writeFile(join(directory, 'grade.json'), '{}');
    await assert.rejects(verifyArtifact(directory, artifact), /digest mismatch/);
    await assert.rejects(verifyArtifact(directory, { ...artifact, path: 'missing.json' }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('reservation upper bound includes every permitted model call and infra ceiling', () => {
  assert.equal(
    maximumCost({
      calls: 10,
      inputTokens: 1000,
      outputTokens: 1000,
      inputUsdPerMillion: 1,
      outputUsdPerMillion: 3,
      infrastructureMaximumUsd: 0.1,
    }),
    0.14,
  );
  assert.throws(() => maximumCost({ calls: Infinity }));
});
