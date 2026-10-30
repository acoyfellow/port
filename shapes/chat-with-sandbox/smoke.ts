import * as Schema from 'effect/Schema';
import { client, prove } from '../kit/smoke.ts';

const Box = Schema.Struct({ boot: Schema.String, note: Schema.String });
const Turn = Schema.Struct({ n: Schema.Number, text: Schema.String, reply: Schema.String });
const Reply = Schema.Struct({ box: Box, turns: Schema.Array(Turn) });
const Stopped = Schema.Struct({ stopped: Schema.Boolean });

const api = client('chat-with-sandbox');
const a = `a-${Date.now()}`;
const b = `b-${Date.now()}`;

const wrote = await api.get(`/turn?c=${a}&text=${encodeURIComponent('write alpha')}`, Reply, { tries: 60 });
const readA = await api.get(`/turn?c=${a}&text=read`, Reply, { tries: 60 });
await api.get(`/stop?c=${a}`, Stopped, { tries: 10 });
const readB = await api.get(`/turn?c=${b}&text=read`, Reply, { tries: 60 });
await api.get(`/stop?c=${b}`, Stopped, { tries: 10 });

const ok =
  wrote.box.note === 'alpha' &&
  readA.box.note === 'alpha' &&
  readA.box.boot === wrote.box.boot &&
  readA.turns.length === 2 &&
  readB.box.note === '' &&
  readB.turns.length === 1 &&
  readB.box.boot !== readA.box.boot;

prove(
  'Chat A wrote /home/user/note.txt in its own container. Chat A kept 2 Durable Object turns. Chat B got a different container. Chat B had no note and 1 turn.',
  ok,
  {
    bootA: readA.box.boot.slice(0, 8),
    bootB: readB.box.boot.slice(0, 8),
    noteA: readA.box.note,
    noteB: readB.box.note,
    turnsA: readA.turns.length,
    turnsB: readB.turns.length,
  },
);
