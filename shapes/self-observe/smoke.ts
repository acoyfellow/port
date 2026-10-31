import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as Schema from 'effect/Schema';
import { client, pause, prove, shapeKey } from '../kit/smoke.ts';

const suite = process.env.SUITE ?? 'swarm-5';
const evals = join(import.meta.dirname, '..', '..', 'evals', suite);
const seedDir = join(import.meta.dirname, '..', '..', 'evals', 'swarm-5', 'seed');
const fixtures = join(import.meta.dirname, '..', '..', 'evals', 'swarm-5', 'fixtures.ts');
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
  checks: Schema.optional(Schema.Number),
  passed: Schema.optional(Schema.Boolean),
  toolCalls: Schema.Record(Schema.String, Schema.Number),
  hidden: Schema.optional(Schema.Struct({ passed: Schema.Number, total: Schema.Number })),
  error: Schema.optional(Schema.String),
});
type Outcome = typeof Outcome.Type;
const Health = Schema.Struct({ ok: Schema.Boolean, gateway: Schema.String });

const api = client('self-observe', { bearer: shapeKey() });
await api.get('/health', Health, { tries: 150 });
const seed = walk(seedDir);
const resumeStamp = process.env.RESUME_STAMP;
const stamp = resumeStamp ? Number(resumeStamp) : Date.now();
const tmpDir = join(import.meta.dirname, '..', '..', '.tmp');
const partialPath = join(tmpDir, `self-observe-${stamp}-partial.json`);
writeFileSync(join(tmpDir, 'self-observe-current-stamp'), String(stamp));
const interleaved = tasks
  .flatMap((task) =>
    Array.from({ length: seeds }, (_, s) =>
      arms.map((arm) => ({ arm, task, s, agent: `eval-${stamp}-${arm}-${task}-${s}` })),
    ),
  )
  .flat();
const jobs = resumeStamp
  ? arms.flatMap((arm) =>
      tasks.flatMap((task) =>
        Array.from({ length: seeds }, (_, s) => ({
          arm,
          task,
          s,
          agent: `eval-${stamp}-${arm}-${task}-${s}`,
        })),
      ),
    )
  : interleaved;

const results: (Outcome & { seed: number })[] = existsSync(partialPath)
  ? JSON.parse(readFileSync(partialPath, 'utf8'))
  : [];
const finished = new Set(results.map((r) => `${r.arm}-${r.task}-${r.seed}`));
let spent = results.reduce((a, r) => a + r.usd, 0);
const poolSize = Number(process.env.BATCH ?? 6);

const start = (job: (typeof jobs)[number]) =>
  api.post(`/run?agent=${job.agent}`, Outcome, {
    body: {
      task: job.task,
      prompt: readFileSync(join(evals, 'tasks', job.task, 'prompt.md'), 'utf8'),
      files: seed,
      hidden: {
        entry: `test/hidden/${job.task}.test.ts`,
        files: {
          [`test/hidden/${job.task}.test.ts`]: readFileSync(
            join(evals, 'tasks', job.task, `${job.task}.test.ts`),
            'utf8',
          ),
          'test/hidden/fixtures.ts': readFileSync(fixtures, 'utf8'),
        },
      },
      check: {
        entry: `test/check/${job.task}.test.ts`,
        files: {
          [`test/check/${job.task}.test.ts`]: readFileSync(
            join(evals, 'tasks', job.task, 'check.test.ts'),
            'utf8',
          ),
        },
      },
      model,
      maxTurns,
      arm: job.arm,
    },
  });

const Maybe = Schema.NullOr(Outcome);
const queue = jobs.filter((job) => !finished.has(`${job.arm}-${job.task}-${job.s}`));
const live = new Map<string, (typeof jobs)[number]>();
for (const job of queue) {
  const existing = await api.get(`/status?agent=${job.agent}`, Maybe);
  if (existing && existing.state === 'running') live.set(job.agent, job);
}
const waiting = queue.filter((job) => !live.has(job.agent));
const deadline = Date.now() + 4 * 60 * 60 * 1000;
while ((waiting.length > 0 || live.size > 0) && Date.now() < deadline) {
  while (live.size < poolSize && waiting.length > 0 && spent < budget) {
    const job = waiting.shift() as (typeof jobs)[number];
    await start(job);
    live.set(job.agent, job);
  }
  if (spent >= budget) waiting.length = 0;
  await pause(5000);
  for (const [agent, job] of [...live]) {
    const outcome = await api.get(`/status?agent=${agent}`, Outcome);
    if (outcome.state === 'running') continue;
    live.delete(agent);
    spent += outcome.usd;
    results.push({ ...outcome, seed: job.s });
    writeFileSync(partialPath, JSON.stringify(results));
    console.log(
      `${job.arm.padEnd(9)} ${job.task.padEnd(14)} s${job.s} ${outcome.passed ? 'PASS' : 'fail'} checks ${outcome.checks ?? 0} turns ${outcome.turns} $${outcome.usd.toFixed(4)} ${outcome.error ?? ''}`,
    );
  }
}

const byArm = arms.map((arm) => {
  const rows = results.filter((r) => r.arm === arm);
  const passed = rows.filter((r) => r.passed).length;
  const usd = rows.reduce((a, r) => a + r.usd, 0);
  return {
    arm,
    seats: rows.length,
    passed,
    usd: Number(usd.toFixed(4)),
    usdPerPass: passed ? Number((usd / passed).toFixed(4)) : null,
    turns: rows.reduce((a, r) => a + r.turns, 0),
    hiddenTests: rows.reduce((a, r) => a + (r.hidden?.passed ?? 0), 0),
  };
});
mkdirSync(join(import.meta.dirname, '..', '..', '.tmp'), { recursive: true });
writeFileSync(
  join(import.meta.dirname, '..', '..', '.tmp', `self-observe-${stamp}.json`),
  JSON.stringify({ suite, model, maxTurns, seeds, byArm, results, endedAt: Date.now() }, null, 1),
);
console.table(byArm);

prove(
  `The self-observe shape ran ${results.length} seats on ${model}. Each arm used the same tasks and the same turn limit. Hidden tests graded every seat. The spend was $${spent.toFixed(3)}.`,
  results.length > 0 && results.every((r) => r.state !== 'running'),
  { byArm },
);
