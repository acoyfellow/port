import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as Schema from 'effect/Schema';
import { client, pause, prove, shapeKey } from '../kit/smoke.ts';

const evals = join(import.meta.dirname, '..', '..', 'evals', 'swarm-5');
const task = 'money-words';
const model = '@cf/moonshotai/kimi-k2.6';

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
const Health = Schema.Struct({ ok: Schema.Boolean, gateway: Schema.String });
const Outcome = Schema.Struct({
  state: Schema.Literals(['running', 'done', 'failed']),
  turns: Schema.Number,
  usd: Schema.Number,
  toolCalls: Schema.Record(Schema.String, Schema.Number),
  hidden: Schema.optional(Schema.Struct({ passed: Schema.Number, total: Schema.Number })),
});

const api = client('isolate-agents', { bearer: shapeKey() });
const seed = walk(join(evals, 'seed'));
const visible = Object.keys(seed).filter((path) => /^test\/[^/]+\.test\.ts$/.test(path));

const health = await api.get('/health', Health, { tries: 150 });
const seedRun = await api.post('/selftest', Results, { body: { files: seed, tests: visible } });
const probe = {
  ...seed,
  'test/net.test.ts':
    "import { test } from 'node:test';\ntest('reach the internet', async () => { await fetch('https://example.com/'); });\n",
};
const probeRun = await api.post('/selftest', Results, {
  body: { files: probe, tests: ['test/net.test.ts'] },
});

const agent = `smoke-${Date.now()}`;
await api.post(`/run?agent=${agent}`, Outcome, {
  body: {
    task,
    prompt: readFileSync(join(evals, 'tasks', task, 'prompt.md'), 'utf8'),
    files: seed,
    hidden: {
      entry: `test/hidden/${task}.test.ts`,
      files: {
        [`test/hidden/${task}.test.ts`]: readFileSync(join(evals, 'tasks', task, `${task}.test.ts`), 'utf8'),
        'test/hidden/fixtures.ts': readFileSync(join(evals, 'fixtures.ts'), 'utf8'),
      },
    },
    model,
    maxTurns: 12,
  },
});

let outcome = await api.get(`/status?agent=${agent}`, Outcome);
for (let check = 0; check < 60 && outcome.state === 'running'; check++) {
  await pause(5000);
  outcome = await api.get(`/status?agent=${agent}`, Outcome);
}

const seedPassed = seedRun.filter((result) => result.ok).length;
const networkBlocked = probeRun.length > 0 && probeRun.every((result) => !result.ok);
const writes = (outcome.toolCalls.write_file ?? 0) + (outcome.toolCalls.edit_file ?? 0);

prove(
  `The seed tests passed in a Worker Loader isolate (${seedPassed} of ${seedRun.length}). A test that called the internet failed, because the isolate has no outbound network. One agent in a Durable Object ran ${outcome.turns} turns through the AI Gateway, changed files ${writes} times and was graded by hidden tests.`,
  health.ok &&
    health.gateway === 'port-shape-isolate-agents' &&
    seedRun.length > 0 &&
    seedPassed === seedRun.length &&
    networkBlocked &&
    outcome.state === 'done' &&
    outcome.turns > 0 &&
    outcome.usd > 0 &&
    writes > 0 &&
    outcome.hidden !== undefined,
  {
    gateway: health.gateway,
    seed: `${seedPassed}/${seedRun.length}`,
    networkBlocked,
    state: outcome.state,
    turns: outcome.turns,
    usd: outcome.usd,
    hidden: outcome.hidden,
  },
);
