import { createHash } from 'node:crypto';
import { getJson, prove, workerUrl } from '../lib.mjs';

const base = workerUrl('port-shape-sealed-box');
const run = `smoke-${Date.now()}`;
const task = 'hello-sealed-box';
const result = await getJson(base, `/run?run=${run}&task=${task}`, 120);
const fingerprint = createHash('sha256').update(task).digest('hex');
const answerOk = result.receipt.answer === [...task].reverse().join('');

prove(
  'a per-run sealed container with internet off answered the task and echoed run id, task sha256 and a fresh nonce',
  result.verified === true &&
    answerOk &&
    result.receipt.fingerprint === fingerprint &&
    result.receipt.internet === false,
  { run, answer: result.receipt.answer, internet: result.receipt.internet, verified: result.verified },
);
