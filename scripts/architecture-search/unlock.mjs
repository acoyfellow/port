import { readFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';

try {
  const [directory] = process.argv.slice(2);
  if (!directory) throw new Error('Campaign directory required');
  const path = resolve(directory, 'executor.lock');
  const owner = JSON.parse(await readFile(path, 'utf8'));
  if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw new Error('Invalid lock owner');
  let alive = true;
  try {
    process.kill(owner.pid, 0);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
    alive = false;
  }
  if (alive) throw new Error('Owner still exists: refusing unlock');
  await rename(path, `${path}.abandoned-${owner.pid}-${Date.now()}`);
  console.log('Abandoned lock archived; spend reservations unchanged');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
