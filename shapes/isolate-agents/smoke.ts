import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as Schema from 'effect/Schema';
import { writePiReceipt } from '../kit/pi-smoke.ts';
import { client, pause, prove, shapeKey } from '../kit/smoke.ts';

const evals = join(import.meta.dirname, '..', '..', 'evals', 'swarm-5');
const task = 'money-words';

const walk = (root: string) => {
  const files: Record<string, string> = {};
  const go = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) go(full);
      else files[relative(root, full)] = readFileSync(full, 'utf8');
    }
  };
  go(root);
  return files;
};

const TestResult = Schema.Struct({ name: Schema.String, file: Schema.String, ok: Schema.Boolean });
const Results = Schema.Array(TestResult);
const Health = Schema.Struct({ ok: Schema.Boolean, gateway: Schema.String, agent: Schema.String });
const Started = Schema.Struct({ request: Schema.String });
const Restarted = Schema.Struct({ restarted: Schema.Boolean });
const Status = Schema.Struct({
  status: Schema.Literals(['running', 'done', 'unanswered']),
  reason: Schema.optional(Schema.String),
  text: Schema.optional(Schema.String),
  usd: Schema.optional(Schema.Number),
  tokens: Schema.optional(Schema.Number),
});
const Files = Schema.Record(Schema.String, Schema.String);

const api = client('isolate-agents', { bearer: shapeKey() });
const seed = walk(join(evals, 'seed'));
const visible = Object.keys(seed).filter((path) => /^test\/[^/]+\.test\.ts$/.test(path));

const health = await api.get('/health', Health, { tries: 150 });
const seedRun = await api.post('/selftest', Results, { body: { files: seed, tests: visible } });
const probeRun = await api.post('/selftest', Results, {
  body: {
    files: {
      ...seed,
      'test/net.test.ts':
        "import { test } from 'node:test';\ntest('reach the internet', async () => { await fetch('https://example.com/'); });\n",
    },
    tests: ['test/net.test.ts'],
  },
});

const agent = `smoke-${Date.now()}`;
const started = Date.now();
await api.post(`/run?agent=${agent}`, Started, {
  body: { prompt: readFileSync(join(evals, 'tasks', task, 'prompt.md'), 'utf8'), files: seed },
});

await pause(3000);
const runningAtRestart = (await api.get(`/status?agent=${agent}`, Status)).status === 'running';
const restarted = (await api.get(`/restart?agent=${agent}`, Restarted)).restarted;
let status = await api.get(`/status?agent=${agent}`, Status, { tries: 60 });
for (let check = 0; check < 120 && status.status === 'running'; check++) {
  await pause(5000);
  status = await api.get(`/status?agent=${agent}`, Status, { tries: 60 });
}

const files = await api.get(`/files?agent=${agent}`, Files);
const hidden = await api.post('/selftest', Results, {
  body: {
    files: {
      ...files,
      [`test/hidden/${task}.test.ts`]: readFileSync(join(evals, 'tasks', task, `${task}.test.ts`), 'utf8'),
      'test/hidden/fixtures.ts': readFileSync(join(evals, 'fixtures.ts'), 'utf8'),
    },
    tests: [`test/hidden/${task}.test.ts`],
  },
});

const seedPassed = seedRun.filter((result) => result.ok).length;
const networkBlocked = probeRun.length > 0 && probeRun.every((result) => !result.ok);
const hiddenPassed = hidden.filter((result) => result.ok).length;

writePiReceipt({
  slug: 'isolate-agents',
  at: new Date().toISOString(),
  agent: health.agent,
  task: `finished the ${task} task; hidden tests passed ${hiddenPassed} of ${hidden.length}`,
  passed: status.status === 'done' && hidden.length > 0 && hiddenPassed === hidden.length,
  restarted,
  resumed: restarted && runningAtRestart && status.status === 'done',
  usd: status.usd ?? 0,
  tokens: status.tokens ?? 0,
  seconds: Math.round((Date.now() - started) / 1000),
  infrastructure: `The tools ran in memory in the Durable Object; node --test ran in Worker Loader isolates (seed ${seedPassed}/${seedRun.length}) with the network ${networkBlocked ? 'blocked' : 'open'}.`,
  infrastructureOk: seedRun.length > 0 && seedPassed === seedRun.length && networkBlocked,
});

prove(
  `Stock Pi (pi-durable) in a Durable Object finished the ${task} task after a forced restart in the middle of the run. Its tests ran in Worker Loader isolates with no network. Hidden tests passed ${hiddenPassed} of ${hidden.length}; Pi recorded $${(status.usd ?? 0).toFixed(4)}.`,
  health.ok &&
    health.agent === 'pi-durable' &&
    seedRun.length > 0 &&
    seedPassed === seedRun.length &&
    networkBlocked &&
    restarted &&
    status.status === 'done' &&
    (status.usd ?? 0) > 0 &&
    hidden.length > 0 &&
    hiddenPassed === hidden.length,
  {
    agent: health.agent,
    gateway: health.gateway,
    seed: `${seedPassed}/${seedRun.length}`,
    networkBlocked,
    restarted,
    status: status.status,
    reason: status.reason,
    usd: status.usd,
    tokens: status.tokens,
    hidden: `${hiddenPassed}/${hidden.length}`,
  },
);
