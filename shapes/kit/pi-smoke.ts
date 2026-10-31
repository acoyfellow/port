import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as Schema from 'effect/Schema';
import { client, pause, prove } from './smoke.ts';

const Health = Schema.Struct({
  ok: Schema.Boolean,
  shape: Schema.String,
  agent: Schema.String,
  gateway: Schema.String,
});
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
const Probe = Schema.Record(Schema.String, Schema.Unknown);

export type PiTask = {
  readonly prompt: string;
  readonly passed: (files: Record<string, string>, answer: string) => boolean;
  readonly describe: string;
};

export type PiSmoke = {
  readonly slug: string;
  readonly task: PiTask;
  readonly bearer?: string;
  readonly infrastructure: (probe: Record<string, unknown>) => {
    readonly ok: boolean;
    readonly claim: string;
  };
  readonly restartAfterChecks?: number;
};

export type PiReceipt = {
  readonly slug: string;
  readonly at: string;
  readonly agent: string;
  readonly task: string;
  readonly passed: boolean;
  readonly restarted: boolean;
  readonly resumed: boolean;
  readonly usd: number;
  readonly tokens: number;
  readonly seconds: number;
  readonly infrastructure: string;
  readonly infrastructureOk: boolean;
  readonly reason?: string;
};

export const runPiSmoke = async (smoke: PiSmoke) => {
  const api = client(smoke.slug, smoke.bearer === undefined ? undefined : { bearer: smoke.bearer });
  const started = Date.now();
  const health = await api.get('/health', Health, { tries: 150 });
  const agent = `smoke-${Date.now()}`;
  await api.post(`/run?agent=${agent}`, Started, { body: { prompt: smoke.task.prompt } });
  let status = await api.get(`/status?agent=${agent}`, Status);
  let restarted = false;
  let runningAtRestart = false;
  for (let check = 0; check < 150 && status.status === 'running'; check++) {
    await pause(4000);
    if (!restarted && check === (smoke.restartAfterChecks ?? 2)) {
      runningAtRestart = status.status === 'running';
      restarted = (await api.get(`/restart?agent=${agent}`, Restarted)).restarted;
    }
    status = await api.get(`/status?agent=${agent}`, Status, { tries: 60 });
  }
  const files = await api.get(`/files?agent=${agent}`, Files, { tries: 30 });
  const probe = await api.get(`/probe?agent=${agent}`, Probe, { tries: 30 });
  const infrastructure = smoke.infrastructure(probe);
  const passed = status.status === 'done' && smoke.task.passed(files, status.text ?? '');
  const receipt: PiReceipt = {
    slug: smoke.slug,
    at: new Date().toISOString(),
    agent: health.agent,
    task: smoke.task.describe,
    passed,
    restarted,
    resumed: restarted && runningAtRestart && status.status === 'done',
    usd: status.usd ?? 0,
    tokens: status.tokens ?? 0,
    seconds: Math.round((Date.now() - started) / 1000),
    infrastructure: infrastructure.claim,
    infrastructureOk: infrastructure.ok,
    ...(status.reason === undefined ? {} : { reason: status.reason }),
  };
  writeFileSync(
    join(import.meta.dirname, '..', '..', 'proof', 'pi', `${smoke.slug}.json`),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  prove(
    `Stock Pi (pi-durable) ${smoke.task.describe} on ${smoke.slug}, resumed after a forced restart, and spent $${receipt.usd.toFixed(4)} by Pi's own count. ${infrastructure.claim}`,
    health.agent === 'pi-durable' &&
      receipt.passed &&
      receipt.resumed &&
      receipt.usd > 0 &&
      receipt.infrastructureOk,
    { ...receipt, files: Object.keys(files).slice(0, 12) },
  );
};

export const fileTask: PiTask = {
  prompt:
    'In the current directory, write fizzbuzz.py: a function fizzbuzz(n) that returns "Fizz" for multiples of 3, "Buzz" for multiples of 5, "FizzBuzz" for both, else str(n). Then write NOTES.md with one line that says what you built. Read both files back to check them, then reply with one short sentence.',
  passed: (files) =>
    (files['fizzbuzz.py'] ?? '').includes('def fizzbuzz') && (files['NOTES.md'] ?? '').trim() !== '',
  describe: 'wrote and checked fizzbuzz.py and NOTES.md',
};
