import { createHash } from 'node:crypto';
import * as Schema from 'effect/Schema';
import { client, prove } from '../kit/smoke.ts';

const Receipt = Schema.Struct({
  answer: Schema.String,
  run: Schema.String,
  fingerprint: Schema.String,
  nonce: Schema.String,
  internet: Schema.Boolean,
});
const Result = Schema.Struct({ receipt: Receipt, verified: Schema.Boolean });

const api = client('sealed-box');
const run = `smoke-${Date.now()}`;
const task = 'hello-sealed-box';
const result = await api.get(`/run?run=${run}&task=${task}`, Result, { tries: 120 });
const fingerprint = createHash('sha256').update(task).digest('hex');
const answerOk = result.receipt.answer === [...task].reverse().join('');

prove(
  'A sealed container ran one task with internet off. It returned the correct answer. It echoed the run ID, the task SHA-256 and a fresh nonce.',
  result.verified && answerOk && result.receipt.fingerprint === fingerprint && !result.receipt.internet,
  { run, answer: result.receipt.answer, internet: result.receipt.internet, verified: result.verified },
);
