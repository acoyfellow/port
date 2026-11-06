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
  entryPoints: [join(root, 'shapes', 'isolate-agents', 'src', 'index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  external: ['cloudflare:workers', 'node:*'],
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
mkdirSync(join(root, 'static'), { recursive: true });
writeFileSync(join(root, 'static/fleet.svg'), `${diagramSvg(fleetDiagram())}\n`);

const SHAPES = [
  'isolate-agents',
  'durable-session',
  'agent-room',
  'self-editing-app',
  'self-observe',
  'chat-with-sandbox',
  'container-per-thread',
  'sealed-box',
  'person-with-computer',
  'shared-container',
  'git-gatekeeper',
  'git-gatekeeper/gate',
  'gadget-workspace',
  'gadget-workspace/gate',
  'egress-filter',
  'egress-filter/filter',
  'snapshot-rollback',
];
const shapeCode = {};
for (const slug of SHAPES) {
  const [shapeSlug, part] = slug.split('/');
  const built = await build({
    entryPoints: [join(root, 'shapes', shapeSlug, part ?? 'src', 'index.ts')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    external: ['cloudflare:*', 'node:*'],
    mainFields: ['module', 'main'],
    conditions: ['workerd', 'worker', 'import'],
    minify: true,
    write: false,
    logLevel: 'warning',
    absWorkingDir: join(root, 'shapes'),
  });
  shapeCode[slug] = built.outputFiles[0].text;
}
const bundles = join(root, 'static', 'shape-bundles');
mkdirSync(bundles, { recursive: true });
for (const [slug, source] of Object.entries(shapeCode))
  writeFileSync(join(bundles, `${slug.replace('/', '--')}.js`), source);
const shapeVersions = Object.fromEntries(
  Object.entries(shapeCode).map(([slug, source]) => [
    slug,
    createHash('sha256').update(source).digest('hex').slice(0, 12),
  ]),
);
writeFileSync(
  join(out, 'shape-bundles.ts'),
  `export const SHAPE_VERSIONS: Record<string, string> = ${JSON.stringify(shapeVersions)};\n`,
);

console.log(`fleet bundle ${version} ${(code.length / 1024).toFixed(0)} KB, ${tasks.length} tasks`);
