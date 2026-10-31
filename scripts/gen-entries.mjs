import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const entriesDir = join(root, 'shared', 'entries');
const shapesDir = join(root, 'shapes');
const order = [
  'isolate-agents',
  'durable-session',
  'chat-with-sandbox',
  'agent-room',
  'container-per-thread',
  'person-with-computer',
  'shared-container',
  'sealed-box',
  'self-editing-app',
];
const rank = (slug) => order.indexOf(slug) + 1 || 99;

const shapeSlugs = readdirSync(shapesDir).filter((name) => existsSync(join(shapesDir, name, 'shape.ts')));
const entrySlugs = readdirSync(entriesDir)
  .filter((name) => name.endsWith('.ts') && name !== 'index.ts')
  .map((name) => name.slice(0, -3))
  .filter((slug) => !shapeSlugs.includes(slug));

const buildOf = (slug) => {
  const file = join(root, 'proof', 'pi', `${slug}.json`);
  if (!existsSync(file)) return undefined;
  const receipt = JSON.parse(readFileSync(file, 'utf8'));
  if (receipt.agent !== 'pi-durable' || receipt.passed !== true || receipt.infrastructureOk !== true)
    return undefined;
  return {
    task: receipt.task,
    infrastructure: receipt.infrastructure,
    usd: receipt.usd,
    tokens: receipt.tokens,
    seconds: receipt.seconds,
    resumed: receipt.resumed === true,
    on: receipt.at.slice(0, 10),
  };
};

const ident = (slug) => slug.replaceAll('-', '_');
const all = [
  ...shapeSlugs.map((slug) => ({ slug, from: `../../shapes/${slug}/shape`, name: 'SHAPE' })),
  ...entrySlugs.map((slug) => ({ slug, from: `./${slug}`, name: 'ENTRY' })),
].sort((a, b) => rank(a.slug) - rank(b.slug));

const imports = all.map(({ slug, from, name }) => `import { ${name} as ${ident(slug)} } from '${from}';`);
const builds = Object.fromEntries(
  shapeSlugs.map((slug) => [slug, buildOf(slug)]).filter(([, build]) => build !== undefined),
);
const items = all.map(({ slug }) =>
  builds[slug] === undefined ? ident(slug) : `{ ...${ident(slug)}, build: BUILDS[${JSON.stringify(slug)}] }`,
);

writeFileSync(
  join(entriesDir, 'index.ts'),
  `import type { Entry, ShapeBuild } from '../entry.ts';\n${imports.join('\n')}\n\nconst BUILDS: Readonly<Record<string, ShapeBuild>> = ${JSON.stringify(builds, null, 2)};\n\nexport const ENTRIES: readonly Entry[] = [\n  ${items.join(',\n  ')},\n];\n`,
);
console.log(`entries: ${all.map(({ slug }) => slug).join(', ')}; builds: ${Object.keys(builds).length}`);
