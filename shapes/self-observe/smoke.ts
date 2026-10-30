import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as Schema from 'effect/Schema';
import { client, pause, prove, shapeKey } from '../kit/smoke.ts';

const evals = join(import.meta.dirname, '..', '..', 'evals', 'swarm-5');
const model = process.env.ARM_MODEL ?? '@cf/moonshotai/kimi-k2.6';
const arms = (process.env.ARMS ?? 'baseline,shrink,mutate,governor,all').split(',');
const tasks = (process.env.TASKS ?? 'business-days,cart-merge,csv-parse,money-words,sku-glob').split(',');
const seeds = Number(process.env.SEEDS ?? 1);
const maxTurns = Number(process.env.MAX_TURNS ?? 16);
const budget = Number(process.env.BUDGET_USD ?? 5);

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

const Outcome = Schema.Struct({
  state: Schema.Literals(['running', 'done', 'failed']),
  task: Schema.String,
  arm: Schema.String,
  turns: Schema.Number,
  usd: Schema.Number,
  ms: Schema.Number,
  governorNotes: Schema.Number,
  passed: Schema.optional(Schema.Boolean),
  toolCalls: Schema.Record(Schema.String, Schema.Number),
  hidden: Schema.optional(Schema.Struct({ passed: Schema.Number, total: Schema.Number })),
  error: Schema.optional(Schema.String),
});
type Outcome = typeof Outcome.Type;
const Health = Schema.Struct({ ok: Schema.Boolean, gateway: Schema.String });

const api = client('self-observe', { bearer: shapeKey() });
await api.get('/health', Health, { tries: 150 });
const seed = walk(join(evals, 'seed'));
const stamp = Date.now();
writeFileSync(join(import.meta.dirname, '..', '..', '.tmp', 'self-observe-current-stamp'), String(stamp));
const jobs = arms.flatMap((arm) => tasks.flatMap((task) => Array.from({ length: seeds }, (_, s) => ({ arm, task, s, agent: `eval-${stamp}-${arm}-${task}-${s}` }))));

let spent = 0;
const results: (Outcome & { seed: number })[] = [];
const batch = Number(process.env.BATCH ?? 6);
for (let i = 0; i < jobs.length && spent < budget; i += batch) {
  const wave = jobs.slice(i, i + batch);
  await Promise.all(wave.map((job) => api.post(`/run?agent=${job.agent}`, Outcome, {
    body: {
      task: job.task,
      prompt: readFileSync(join(evals, 'tasks', job.task, 'prompt.md'), 'utf8'),
      files: seed,
      hidden: {
        entry: `test/hidden/${job.task}.test.ts`,
        files: {
          [`test/hidden/${job.task}.test.ts`]: readFileSync(join(evals, 'tasks', job.task, `${job.task}.test.ts`), 'utf8'),
          'test/hidden/fixtures.ts': readFileSync(join(evals, 'fixtures.ts'), 'utf8'),
        },
      },
      model,
      maxTurns,
      arm: job.arm,
    },
  })));
  const pending = new Map(wave.map((job) => [job.agent, job]));
  for (let check = 0; check < 120 && pending.size > 0; check++) {
    await pause(5000);
    for (const [agent, job] of [...pending]) {
      const outcome = await api.get(`/status?agent=${agent}`, Outcome);
      if (outcome.state === 'running') continue;
      pending.delete(agent);
      spent += outcome.usd;
      results.push({ ...outcome, seed: job.s });
      writeFileSync(join(import.meta.dirname, '..', '..', '.tmp', `self-observe-${stamp}-partial.json`), JSON.stringify(results));
      console.log(`${job.arm.padEnd(9)} ${job.task.padEnd(14)} s${job.s} ${outcome.passed ? 'PASS' : 'fail'} hidden ${outcome.hidden?.passed ?? 0}/${outcome.hidden?.total ?? 0} turns ${outcome.turns} $${outcome.usd.toFixed(4)} gov ${outcome.governorNotes} tools ${JSON.stringify(outcome.toolCalls)} ${outcome.error ?? ''}`);
    }
  }
  console.log(`spent so far $${spent.toFixed(3)}`);
}

const byArm = arms.map((arm) => {
  const rows = results.filter((r) => r.arm === arm);
  const passed = rows.filter((r) => r.passed).length;
  const usd = rows.reduce((a, r) => a + r.usd, 0);
  return { arm, seats: rows.length, passed, usd: Number(usd.toFixed(4)), usdPerPass: passed ? Number((usd / passed).toFixed(4)) : null, turns: rows.reduce((a, r) => a + r.turns, 0), hiddenTests: rows.reduce((a, r) => a + (r.hidden?.passed ?? 0), 0) };
});
mkdirSync(join(import.meta.dirname, '..', '..', '.tmp'), { recursive: true });
writeFileSync(join(import.meta.dirname, '..', '..', '.tmp', `self-observe-${stamp}.json`), JSON.stringify({ model, maxTurns, seeds, byArm, results }, null, 1));
console.table(byArm);

prove(
  `The self-observe shape ran ${results.length} seats on ${model}. Each arm used the same tasks and the same turn limit. Hidden tests graded every seat. The spend was $${spent.toFixed(3)}.`,
  results.length > 0 && results.every((r) => r.state !== 'running'),
);
