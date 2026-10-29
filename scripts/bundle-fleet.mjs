import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { build } from 'esbuild';

const root = new URL('..', import.meta.url).pathname;
const evals = join(root, 'evals/swarm-5');
const out = join(root, 'worker/generated');
const TASKS = ['business-days', 'cart-merge', 'csv-parse', 'money-words', 'sku-glob'];

const walk = (dir) => {
  const files = {};
  const go = (current) => {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) go(full);
      else files[relative(dir, full)] = readFileSync(full, 'utf8');
    }
  };
  go(dir);
  return files;
};

const bundle = await build({
  entryPoints: [join(root, 'fleet/worker.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  external: ['cloudflare:workers'],
  mainFields: ['module', 'main'],
  conditions: ['workerd', 'worker', 'import'],
  minify: true,
  write: false,
  logLevel: 'warning',
});
const code = bundle.outputFiles[0].text;

const fixtures = readFileSync(join(evals, 'fixtures.ts'), 'utf8');
const tasks = TASKS.map((task) => ({
  task,
  prompt: readFileSync(join(evals, 'tasks', task, 'prompt.md'), 'utf8'),
  hidden: {
    entry: `test/hidden/${task}.test.ts`,
    files: {
      [`test/hidden/${task}.test.ts`]: readFileSync(join(evals, 'tasks', task, `${task}.test.ts`), 'utf8'),
      'test/hidden/fixtures.ts': fixtures,
    },
  },
}));

mkdirSync(out, { recursive: true });
const version = createHash('sha256').update(code).digest('hex').slice(0, 12);
writeFileSync(
  join(out, 'fleet-bundle.ts'),
  `export const FLEET_BUNDLE = ${JSON.stringify(code)};\n\nexport const FLEET_VERSION = ${JSON.stringify(version)};\n`,
);
writeFileSync(
  join(out, 'swarm-5.ts'),
  `export const SEED: Record<string, string> = ${JSON.stringify(walk(join(evals, 'seed')))};\n\nexport const TASKS = ${JSON.stringify(tasks)} as const;\n`,
);
const diagram = await build({
  entryPoints: [join(root, 'shared/fleet-diagram.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  write: false,
  logLevel: 'warning',
});
const { diagramSvg, fleetDiagram } = await import(
  `data:text/javascript;base64,${Buffer.from(diagram.outputFiles[0].text).toString('base64')}`
);
mkdirSync(join(root, 'client/public'), { recursive: true });
writeFileSync(join(root, 'client/public/fleet.svg'), `${diagramSvg(fleetDiagram())}\n`);

console.log(`fleet bundle ${version} ${(code.length / 1024).toFixed(0)} KB, ${tasks.length} tasks`);
