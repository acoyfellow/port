import { getJson, prove, workerUrl } from '../lib.mjs';

const base = workerUrl('port-shape-chat-with-sandbox');
const a = `a-${Date.now()}`;
const b = `b-${Date.now()}`;

const wrote = await getJson(base, `/turn?c=${a}&text=${encodeURIComponent('write alpha')}`, 60);
const readA = await getJson(base, `/turn?c=${a}&text=read`, 60);
await getJson(base, `/stop?c=${a}`, 10);
const readB = await getJson(base, `/turn?c=${b}&text=read`, 60);
await getJson(base, `/stop?c=${b}`, 10);

const ok =
  wrote.box.note === 'alpha' &&
  readA.box.note === 'alpha' &&
  readA.box.boot === wrote.box.boot &&
  readA.turns.length === 2 &&
  readB.box.note === '' &&
  readB.turns.length === 1 &&
  readB.box.boot !== readA.box.boot;

prove(
  'chat A wrote /home/user/note.txt in its own container and kept 2 DO turns; chat B got a different container with no note and 1 turn',
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
