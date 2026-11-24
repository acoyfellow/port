import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export const verifyArtifact = async (directory, artifact) => {
  if (!artifact || typeof artifact.path !== 'string' || !/^[a-f0-9]{64}$/.test(artifact.sha256))
    throw new Error('Invalid evidence reference');
  const path = resolve(directory, artifact.path);
  const local = relative(directory, path);
  if (isAbsolute(artifact.path) || local.startsWith('..') || isAbsolute(local))
    throw new Error('Evidence outside campaign');
  const bytes = await readFile(path);
  if (digest(bytes) !== artifact.sha256) throw new Error('Evidence digest mismatch');
  return JSON.parse(bytes.toString('utf8'));
};

export const maximumCost = ({
  calls,
  inputTokens,
  outputTokens,
  inputUsdPerMillion,
  outputUsdPerMillion,
  infrastructureMaximumUsd,
}) => {
  if (![calls, inputTokens, outputTokens].every((value) => Number.isSafeInteger(value) && value > 0))
    throw new Error('Finite positive token and call caps required');
  if (
    ![inputUsdPerMillion, outputUsdPerMillion, infrastructureMaximumUsd].every(
      (value) => Number.isFinite(value) && value >= 0,
    )
  )
    throw new Error('Verified nonnegative rates required');
  return (
    (calls * (inputTokens * inputUsdPerMillion + outputTokens * outputUsdPerMillion)) / 1_000_000 +
    infrastructureMaximumUsd
  );
};
