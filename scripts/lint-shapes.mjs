import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const SHAPES = [
  'isolate-agents',
  'durable-session',
  'agent-room',
  'self-editing-app',
  'sealed-box',
  'chat-with-sandbox',
  'container-per-thread',
  'person-with-computer',
  'shared-container',
];

const root = join(import.meta.dirname, '..');
const shapes = join(root, 'shapes');
const read = (...parts) => readFileSync(join(...parts), 'utf8');
const ALLOWED = new Set(['shape.ts', 'alchemy.run.ts', 'smoke.ts', 'src', 'box', '.alchemy', '.DS_Store']);
const BOILERPLATE = [
  "from 'alchemy'",
  "from 'alchemy/Cloudflare'",
  'Alchemy.Stack',
  'localState',
  'compatibility',
  'workersDev',
  'workers.dev',
  'SHAPE_SUBDOMAIN',
  'setTimeout',
];

const checkShape = (slug) => {
  const dir = join(shapes, slug);
  if (!existsSync(dir)) return [`shapes/${slug} is missing`];
  const problems = [];
  const names = readdirSync(dir);
  for (const required of ['shape.ts', 'alchemy.run.ts', 'smoke.ts', 'src'])
    if (!names.includes(required)) problems.push(`missing ${required}`);
  for (const name of names) if (!ALLOWED.has(name)) problems.push(`unexpected ${name}`);
  if (names.includes('src') && !existsSync(join(dir, 'src', 'index.ts')))
    problems.push('missing src/index.ts');
  if (names.includes('box') && !existsSync(join(dir, 'box', 'Dockerfile')))
    problems.push('box/ has no Dockerfile');
  if (problems.length > 0) return problems;

  const stack = read(dir, 'alchemy.run.ts');
  if (!stack.includes("from '../kit/stack.ts'"))
    problems.push('alchemy.run.ts does not use shapes/kit/stack.ts');
  if (!stack.includes(`shapeStack('${slug}'`))
    problems.push(`alchemy.run.ts does not call shapeStack('${slug}', …)`);
  const smoke = read(dir, 'smoke.ts');
  if (!smoke.includes("from '../kit/smoke.ts'")) problems.push('smoke.ts does not use shapes/kit/smoke.ts');
  if (!smoke.includes(`client('${slug}')`)) problems.push(`smoke.ts does not call client('${slug}')`);
  if (!smoke.includes('prove(')) problems.push('smoke.ts never calls prove');
  for (const [file, text] of [
    ['alchemy.run.ts', stack],
    ['smoke.ts', smoke],
  ])
    for (const marker of BOILERPLATE)
      if (text.includes(marker)) problems.push(`${file} repeats kit boilerplate: ${marker}`);
  const usesContainer = stack.includes('container<');
  if (usesContainer !== names.includes('box'))
    problems.push(
      usesContainer
        ? 'stack uses a container but box/ is missing'
        : 'box/ exists but the stack has no container',
    );

  const shape = read(dir, 'shape.ts');
  if (!shape.includes(`slug: '${slug}'`)) problems.push(`shape.ts slug is not '${slug}'`);
  if (!shape.includes('export const SHAPE: Entry')) problems.push('shape.ts does not export SHAPE: Entry');
  if (existsSync(join(root, 'shared', 'entries', `${slug}.ts`)))
    problems.push(`shared/entries/${slug}.ts still exists; shape.ts is the only manifest`);
  return problems;
};

const checkWorkspace = () => {
  const problems = [];
  for (const slug of readdirSync(shapes)) {
    const dir = join(shapes, slug);
    if (!statSync(dir).isDirectory() || slug === 'kit' || slug === 'node_modules') continue;
    if (!SHAPES.includes(slug)) problems.push(`shapes/${slug} is not a known shape`);
    for (const name of ['package.json', 'package-lock.json', 'node_modules', 'smoke.mjs'])
      if (existsSync(join(dir, name)))
        problems.push(`shapes/${slug}/${name} must not exist; use the workspace`);
  }
  if (existsSync(join(shapes, 'lib.mjs'))) problems.push('shapes/lib.mjs is replaced by shapes/kit');
  if (existsSync(join(root, 'fleet'))) problems.push('fleet/ must move to shapes/isolate-agents');
  const index = read(root, 'shared', 'entries', 'index.ts');
  for (const slug of SHAPES)
    if (!index.includes(`shapes/${slug}/shape`))
      problems.push(`shared/entries/index.ts does not load shapes/${slug}/shape.ts`);
  return problems;
};

const results = [
  ...SHAPES.map((slug) => ({ name: slug, problems: checkShape(slug) })),
  { name: 'workspace', problems: checkWorkspace() },
];
for (const { name, problems } of results)
  console.log(problems.length === 0 ? `ok   ${name}` : `FAIL ${name}: ${problems.join('; ')}`);
const pass = results.every(({ problems }) => problems.length === 0);
console.log(pass ? 'lint: PASS' : 'lint: FAIL');
process.exit(pass ? 0 : 1);
