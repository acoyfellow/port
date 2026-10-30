import * as Schema from 'effect/Schema';
import { client, prove } from '../kit/smoke.ts';

const Home = Schema.Struct({ shape: Schema.String });
const Ship = Schema.Struct({
  shipped: Schema.Boolean,
  version: Schema.Number,
  live: Schema.Number,
  reason: Schema.String,
});
const App = Schema.Struct({ live: Schema.Number, text: Schema.String });
const Rollback = Schema.Struct({ live: Schema.Number });

const api = client('self-editing-app');
const user = `smoke-${Date.now()}`;

await api.get('/', Home);

const app = (text: string, check: string) =>
  `export default { async fetch(req) { const p = new URL(req.url).pathname; if (p === '/__check') return Response.json({ ok: ${check} }); return new Response(${JSON.stringify(text)}); } };`;

const ship = async (source: string) => {
  const reply = await api.raw('POST', `/ship?u=${user}`, source);
  return Schema.decodeUnknownSync(Ship)(reply.json);
};

const v1 = await ship(app('hello v1', 'true'));
const app1 = await api.get(`/app?u=${user}`, App);
const v2 = await ship(app('broken v2', 'false'));
const v3 = await ship('export default { fetch( {');
const appAfterBad = await api.get(`/app?u=${user}`, App);
const v4 = await ship(app('hello v4', 'true'));
const app4 = await api.get(`/app?u=${user}`, App);
const rolled = await api.get(`/rollback?u=${user}`, Rollback);
const appRolled = await api.get(`/app?u=${user}`, App);

prove(
  'The Worker Loader gate shipped v1. The gate rejected v2 because its check failed. The gate rejected v3 because it did not boot. Version 1 stayed live. The gate shipped v4. Rollback made v1 live again.',
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
