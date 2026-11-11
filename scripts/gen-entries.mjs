import { execFileSync } from 'node:child_process';
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
  'git-gatekeeper',
  'gadget-workspace',
  'egress-filter',
  'snapshot-rollback',
  'scheduled-agent',
  'flight-recorder',
  'safe-sql',
  'workflow-plan',
  'vector-memory',
  'write-list',
  'beam-fleet',
  'beam-space',
  'nix-git',
];
const rank = (slug) => order.indexOf(slug) + 1 || 99;

const shapeSlugs = readdirSync(shapesDir).filter((name) => existsSync(join(shapesDir, name, 'shape.ts')));
const entrySlugs = [];

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

const evalReport = JSON.parse(readFileSync(join(root, 'proof', 'eval-all.json'), 'utf8'));

const evalOf = (slug) => {
  const summary = evalReport.summary[slug];
  if (summary === undefined || !(summary.ran > 0) || typeof summary.passed !== 'number') return undefined;
  const rows = evalReport.rows.filter((row) => row.slug === slug);
  const counted = rows.filter((row) => row.usd > 0);
  const capped = rows.filter((row) => row.capped === true || row.usd === 0).length;
  return {
    passed: summary.passed,
    of: summary.of,
    usdPerTask: Number(
      (counted.reduce((sum, row) => sum + row.usd, 0) / Math.max(1, counted.length)).toFixed(4),
    ),
    capped,
    medianSeconds: summary.medianSeconds,
    note: summary.note ?? '',
    on: evalReport.at.slice(0, 10),
  };
};

const addedOn = (slug) => {
  const dates = execFileSync(
    'git',
    ['log', '--diff-filter=A', '--format=%as', '--', `shapes/${slug}/shape.ts`],
    {
      cwd: root,
      encoding: 'utf8',
    },
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  return dates.at(-1) ?? new Date().toISOString().slice(0, 10);
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
const added = Object.fromEntries(shapeSlugs.map((slug) => [slug, addedOn(slug)]));
const evals = Object.fromEntries(
  shapeSlugs.map((slug) => [slug, evalOf(slug)]).filter(([, result]) => result !== undefined),
);
const items = all.map(
  ({ slug }) =>
    `{ ...${ident(slug)}${added[slug] === undefined ? '' : `, added: ${JSON.stringify(added[slug])}`}${builds[slug] === undefined ? '' : `, build: BUILDS[${JSON.stringify(slug)}]`}${evals[slug] === undefined ? '' : `, evalAll: EVALS[${JSON.stringify(slug)}]`} }`,
);

writeFileSync(
  join(entriesDir, 'index.ts'),
  `import type { Entry, EvalAll, ShapeBuild } from '../entry.ts';\n${imports.join('\n')}\n\nconst BUILDS: Readonly<Record<string, ShapeBuild>> = ${JSON.stringify(builds, null, 2)};\n\nconst EVALS: Readonly<Record<string, EvalAll>> = ${JSON.stringify(evals, null, 2)};\n\nexport const ENTRIES: readonly Entry[] = [\n  ${items.join(',\n  ')},\n];\n`,
);
console.log(`entries: ${all.map(({ slug }) => slug).join(', ')}; builds: ${Object.keys(builds).length}`);
