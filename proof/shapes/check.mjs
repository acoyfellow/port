import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sweepAll } from './sweep.mjs';

const SHAPES = [
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

const lockFile = join(import.meta.dirname, '..', '..', '.tmp', 'std-lock-at');
const NOT_BEFORE = existsSync(lockFile) ? Date.parse(readFileSync(lockFile, 'utf8').trim()) : 0;

const dir = import.meta.dirname;
const disproven = existsSync(join(dir, 'DISPROVEN.json'))
  ? JSON.parse(readFileSync(join(dir, 'DISPROVEN.json'), 'utf8'))
  : {};

const verdict = (slug) => {
  const blocker = disproven[slug];
  if (typeof blocker === 'string' && blocker.length > 20)
    return { slug, ok: true, how: `disproven: ${blocker}` };
  const file = join(dir, `${slug}.json`);
  if (!existsSync(file)) return { slug, ok: false, how: 'no receipt' };
  const receipt = JSON.parse(readFileSync(file, 'utf8'));
  const missing = ['up', 'smoke', 'down'].filter((step) => receipt[step]?.ok !== true);
  if (missing.length > 0) return { slug, ok: false, how: `not ok: ${missing.join(', ')}` };
  const order =
    Date.parse(receipt.up.at) < Date.parse(receipt.smoke.at) &&
    Date.parse(receipt.smoke.at) < Date.parse(receipt.down.at);
  if (!order) return { slug, ok: false, how: 'up, smoke, down are not in order' };
  if (Date.parse(receipt.up.at) < NOT_BEFORE)
    return { slug, ok: false, how: 'receipt is older than the standardization lock' };
  const proves = receipt.smoke.tail.some((line) => line.startsWith('PROVED '));
  if (!proves) return { slug, ok: false, how: 'smoke printed no PROVED line' };
  return { slug, ok: true, how: receipt.smoke.tail.filter((line) => line.startsWith('PROVED ')).join(' | ') };
};

const results = SHAPES.map(verdict);
const fresh = await sweepAll();
const clean = Object.keys(fresh.leftovers).length === 0 && Object.keys(fresh.errors).length === 0;

for (const result of results) console.log(`${result.ok ? 'ok  ' : 'FAIL'} ${result.slug}: ${result.how}`);
console.log(
  `${clean ? 'ok  ' : 'FAIL'} sweep: ${clean ? '0 port-shape-* resources' : JSON.stringify(fresh)}`,
);

const pass = clean && results.every((result) => result.ok);
console.log(pass ? 'gate: PASS' : 'gate: FAIL');
process.exit(pass ? 0 : 1);
