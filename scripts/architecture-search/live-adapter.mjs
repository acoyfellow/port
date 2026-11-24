import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveDockerHost } from '../fleet-search/docker-host.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const createAdapter = (outputDirectory) => {
  const directory = pathToFileURL(resolve(outputDirectory) + sep);
  const launch = async (args, name) => {
    await mkdir(directory, { recursive: true });
    const chunks = [];
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: { ...process.env, DOCKER_HOST: resolveDockerHost() },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await writeFile(new URL(`${name}.log`, directory), '');
    const record = (chunk) => {
      chunks.push(chunk);
      appendFileSync(new URL(`${name}.log`, directory), chunk);
    };
    child.stdout.on('data', record);
    child.stderr.on('data', record);
    const status = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', resolve);
    });
    const output = Buffer.concat(chunks).toString('utf8');
    await writeFile(new URL(`${name}.log`, directory), output);
    if (status !== 0) throw new Error(`${name} exited ${status}`);
    return output;
  };

  const slugOf = (id) => {
    const slug = id === 'search-lite-retry' ? 'search-lite' : id;
    if (!['search-lite', 'search-basic', 'search-standard', 'search-diagnostic'].includes(slug))
      throw new Error('Unknown bounded deployment');
    return slug;
  };

  const adapter = {
    run: async (experiment) => {
      const slug = slugOf(experiment.id);
      const started = Date.now();
      await launch(
        [
          'scripts/eval-all.mjs',
          `--shapes=${slug}`,
          `--tasks=${experiment.tasks.join(',')}`,
          '--diagnostics=true',
          `--out=${relative(root, fileURLToPath(new URL(`${experiment.id}.eval.json`, directory)))}`,
        ],
        experiment.id,
      );
      const evaluation = JSON.parse(await readFile(new URL(`${experiment.id}.eval.json`, directory), 'utf8'));
      const shapeNote = evaluation.shapes?.[slug];
      if (
        !shapeNote ||
        shapeNote.coldStartS === null ||
        String(shapeNote.note ?? '').includes('did not come up')
      )
        throw new Error(`Deploy failed for ${slug}: ${shapeNote?.note ?? 'no cold start'}`);
      await writeFile(
        new URL(`${experiment.id}.duration.json`, directory),
        JSON.stringify({ elapsedMs: Date.now() - started }),
      );
      return evaluation;
    },
    cleanup: async (id) => {
      const slug = slugOf(id);
      await launch(['scripts/shape.mjs', slug, 'down'], `${id}-down`);
      const output = await launch(['scripts/shape.mjs', slug, 'sweep'], `${id}-sweep`);
      if (!/"leftovers":\s*\{\s*\}/.test(output)) throw new Error('Missing empty inventory');
      return { remaining: 0 };
    },
    cost: async (id) => {
      const evaluation = JSON.parse(await readFile(new URL(`${id}.eval.json`, directory), 'utf8'));
      const duration = JSON.parse(await readFile(new URL(`${id}.duration.json`, directory), 'utf8'));
      const resources = {
        'search-lite': [0.0625, 0.25, 2],
        'search-diagnostic': [0.0625, 0.25, 2],
        'search-basic': [0.25, 1, 4],
        'search-standard': [0.5, 4, 8],
      }[slugOf(id)];
      if (!resources || !Number.isFinite(duration.elapsedMs) || duration.elapsedMs <= 0)
        throw new Error('Missing runtime accounting');
      const ai = evaluation.rows.reduce((sum, row) => {
        if (!Number.isFinite(row.usd) || row.usd < 0) throw new Error('Missing AI cost');
        return sum + row.usd;
      }, 0);
      const seconds = duration.elapsedMs / 1000;
      const [cpu, memory, disk] = resources;
      const projection = {
        basis: 'conservative-provisioned-capacity-projection',
        limitations: [
          'CPU charged at capacity rather than measured utilization',
          'Includes deployment time in compute duration',
          'DO, request and storage overhead reserved at $0.05 rather than measured',
        ],
        source: 'https://developers.cloudflare.com/containers/platform/pricing/',
        observedAt: '2026-11-11',
        elapsedMs: duration.elapsedMs,
        cost: {
          ai,
          compute: seconds * (cpu * 0.00002 + memory * 0.0000025 + disk * 0.00000007),
          overhead: 0.05,
        },
      };
      await writeFile(new URL(`${id}.projection.json`, directory), JSON.stringify(projection, null, 2));
      return Object.values(projection.cost).reduce((sum, value) => sum + value, 0);
    },
    recover: async (id) => {
      await adapter.cleanup(id);
      try {
        return { remaining: 0, actualUsd: await adapter.cost(id), basis: 'projected' };
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        const ledger = JSON.parse(await readFile(new URL('ledger.json', directory), 'utf8'));
        const maximumUsd = ledger.jobs[id]?.maximumUsd;
        if (!Number.isFinite(maximumUsd)) throw new Error('No reservation to forfeit');
        await writeFile(
          new URL(`${id}.forfeited.json`, directory),
          JSON.stringify({
            basis: 'full-reservation-forfeited',
            chargedUsd: maximumUsd,
            reason: 'Interrupted attempt has incomplete usage evidence',
          }),
        );
        return { remaining: 0, actualUsd: maximumUsd, basis: 'full-reservation-forfeited' };
      }
    },
  };
  return adapter;
};
