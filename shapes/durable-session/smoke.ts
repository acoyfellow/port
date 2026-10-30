import * as Schema from 'effect/Schema';
import { client, prove } from '../kit/smoke.ts';

const Turn = Schema.Struct({ n: Schema.Number, text: Schema.String, boot: Schema.String });
const Read = Schema.Struct({ boot: Schema.String, turns: Schema.Array(Turn) });
const Crash = Schema.Struct({ restarted: Schema.Boolean });

const api = client('durable-session');
const session = `smoke-${Date.now()}`;

for (const text of ['one', 'two', 'three']) await api.get(`/add?s=${session}&text=${text}`, Turn);
const before = await api.get(`/read?s=${session}`, Read);
const crash = await api.get(`/crash?s=${session}`, Crash);
const after = await api.get(`/read?s=${session}`, Read);

const sameTurns = JSON.stringify(before.turns) === JSON.stringify(after.turns) && after.turns.length === 3;

prove(
  'The session kept 3 turns after a forced Durable Object restart. The boot ID changed and the SQLite rows stayed.',
  crash.restarted && sameTurns && before.boot !== after.boot,
  { before: before.boot.slice(0, 8), after: after.boot.slice(0, 8), turns: after.turns.length },
);
