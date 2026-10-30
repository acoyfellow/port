import { getJson, prove, workerUrl } from '../lib.mjs';

const base = workerUrl('port-shape-self-editing-app');
const user = `smoke-${Date.now()}`;

await getJson(base, '/');

const app = (text, check) =>
  `export default { async fetch(req) { const p = new URL(req.url).pathname; if (p === '/__check') return Response.json({ ok: ${check} }); return new Response(${JSON.stringify(text)}); } };`;

const ship = async (source) => {
  const response = await fetch(`${base}/ship?u=${user}`, { method: 'POST', body: source });
  return response.json();
};

const v1 = await ship(app('hello v1', 'true'));
const app1 = await getJson(base, `/app?u=${user}`);
const v2 = await ship(app('broken v2', 'false'));
const v3 = await ship('export default { fetch( {');
const appAfterBad = await getJson(base, `/app?u=${user}`);
const v4 = await ship(app('hello v4', 'true'));
const app4 = await getJson(base, `/app?u=${user}`);
const rolled = await getJson(base, `/rollback?u=${user}`);
const appRolled = await getJson(base, `/app?u=${user}`);

prove(
  'Worker Loader gate shipped v1, rejected a failing-check v2 and a non-booting v3 (live stayed v1), shipped v4, and rollback restored v1',
  v1.shipped &&
    app1.text === 'hello v1' &&
    !v2.shipped &&
    !v3.shipped &&
    appAfterBad.live === 1 &&
    appAfterBad.text === 'hello v1' &&
    v4.shipped &&
    app4.text === 'hello v4' &&
    rolled.live === 1 &&
    appRolled.text === 'hello v1',
  {
    v1,
    v2,
    v3: { shipped: v3.shipped, reason: v3.reason.slice(0, 60) },
    v4,
    appAfterBad,
    app4,
    rolled,
    appRolled,
  },
);
