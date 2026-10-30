import { getJson, prove, workerUrl } from '../lib.mjs';

const base = workerUrl('port-shape-durable-session');
const session = `smoke-${Date.now()}`;

for (const text of ['one', 'two', 'three']) await getJson(base, `/add?s=${session}&text=${text}`);
const before = await getJson(base, `/read?s=${session}`);
const crash = await getJson(base, `/crash?s=${session}`);
const after = await getJson(base, `/read?s=${session}`);

const sameTurns = JSON.stringify(before.turns) === JSON.stringify(after.turns) && after.turns.length === 3;

prove(
  'session kept 3 turns across a forced Durable Object restart (new boot id, same SQLite rows)',
  crash.restarted === true && sameTurns && before.boot !== after.boot,
  {
    before: before.boot.slice(0, 8),
    after: after.boot.slice(0, 8),
    turns: after.turns.length,
    restarted: crash.restarted,
  },
);
