import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const files = {};
const walk = async (path) => {
  for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const target = join(path, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.alchemy') await walk(target);
    } else if (entry.isFile()) {
      files[relative(root, target)] = createHash('sha256')
        .update(await readFile(target))
        .digest('hex');
    }
  }
};
for (const path of [
  'shapes/kit',
  'shapes/search-lite',
  'shapes/search-basic',
  'shapes/search-standard',
  'scripts/architecture-search/budget/src',
  'evals/swarm-5',
])
  await walk(join(root, path));
for (const path of [
  'scripts/eval-all.mjs',
  'scripts/shape.mjs',
  'shapes/package-lock.json',
  'scripts/architecture-search/live-adapter.mjs',
  'scripts/architecture-search/executor.mjs',
])
  files[path] = createHash('sha256')
    .update(await readFile(join(root, path)))
    .digest('hex');
const digest = createHash('sha256').update(JSON.stringify(files)).digest('hex');
const snapshot = { version: 1, digest, files };
const campaign = process.argv[2];
if (!campaign || !/^[a-z0-9-]+$/.test(campaign)) throw new Error('Usage: node pin.mjs CAMPAIGN-NAME');
const target = join(root, `.tmp/${campaign}/pins.json`);
try {
  const prior = JSON.parse(await readFile(target, 'utf8'));
  if (prior.digest !== digest)
    throw new Error('Campaign sources changed: create a new bounded campaign, do not overwrite pins');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await writeFile(target, JSON.stringify(snapshot, null, 2));
}
console.log(digest);
