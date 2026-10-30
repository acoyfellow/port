import * as Schema from 'effect/Schema';
import { client, prove } from '../kit/smoke.ts';

const Computer = Schema.Struct({ host: Schema.String, files: Schema.String });
const Turn = Schema.Struct({ computer: Computer, turns: Schema.Number });
const Stop = Schema.Struct({ stopped: Schema.Boolean });

const api = client('container-per-thread');
const stamp = Date.now();
const a = `thread-a-${stamp}`;
const b = `thread-b-${stamp}`;

const wroteA = await api.get(`/write?t=${a}`, Turn, { tries: 20 });
const readA = await api.get(`/read?t=${a}`, Turn, { tries: 20 });
await api.get(`/stop?t=${a}`, Stop);
const wroteB = await api.get(`/write?t=${b}`, Turn, { tries: 40 });
await api.get(`/stop?t=${b}`, Stop);

const filesA = readA.computer.files.trim().split(' ');
const filesB = wroteB.computer.files.trim().split(' ');
const ok =
  filesA.includes(`${a}.txt`) &&
  readA.turns === 2 &&
  filesB.includes(`${b}.txt`) &&
  !filesB.includes(`${a}.txt`) &&
  wroteA.computer.host !== wroteB.computer.host;

prove(
  'Each thread got its own Durable Object and container. Thread A saw its own file across 2 turns. Thread B got a different host. Thread B did not see the file of thread A.',
  ok,
  { hostA: wroteA.computer.host, hostB: wroteB.computer.host, filesA, filesB, turnsA: readA.turns },
);
