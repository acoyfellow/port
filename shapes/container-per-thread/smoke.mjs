import { getJson, prove, workerUrl } from '../lib.mjs';

const base = workerUrl('port-shape-container-per-thread');
const stamp = Date.now();
const a = `thread-a-${stamp}`;
const b = `thread-b-${stamp}`;

const wroteA = await getJson(base, `/write?t=${a}`, 20);
const readA = await getJson(base, `/read?t=${a}`, 20);
await getJson(base, `/stop?t=${a}`);
const wroteB = await getJson(base, `/write?t=${b}`, 40);
await getJson(base, `/stop?t=${b}`);

const filesA = readA.computer.files.trim().split(' ');
const filesB = wroteB.computer.files.trim().split(' ');
const ok =
  filesA.includes(`${a}.txt`) &&
  readA.turns === 2 &&
  filesB.includes(`${b}.txt`) &&
  !filesB.includes(`${a}.txt`) &&
  wroteA.computer.host !== wroteB.computer.host;

prove(
  "two threads each got their own Durable Object and container: thread A saw its own file across 2 turns, thread B got a different host and could not see A's file",
  ok,
  { hostA: wroteA.computer.host, hostB: wroteB.computer.host, filesA, filesB, turnsA: readA.turns },
);
