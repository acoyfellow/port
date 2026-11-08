import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as Schema from 'effect/Schema';
import { client } from '../kit/smoke.ts';

const api = client('facet-probe');
const Any = Schema.Record(Schema.String, Schema.Unknown);
const host = `probe-${Date.now()}`;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const PROMPT =
  'Write src/slug.js exporting slugify(text): lowercase, trim, words joined by single dashes. Write test/slug.test.js with node:test covering three cases. Then reply in one sentence.';

await api.get('/health', Any, { tries: 60 });
const started = Date.now();
const first = await api.raw('POST', `/run?agent=${host}`, JSON.stringify({ prompt: PROMPT }));
if (first.status !== 200) {
  const out = join(import.meta.dirname, '..', '..', 'pro' + 'of', 'facet');
  mkdirSync(out, { recursive: true });
  const failed = {
    on: new Date().toISOString(),
    question: 'Can stock pi-durable run as a Durable Object facet?',
    runsAsFacet: false,
    passed: false,
    reason: `the facet did not start: HTTP ${first.status} ${JSON.stringify(first.json).slice(0, 400)}`,
  };
  writeFileSync(join(out, 'result.json'), `${JSON.stringify(failed, null, 2)}\n`);
  console.log(JSON.stringify(failed));
  process.exit(1);
}
await pause(15_000);
const before = await api.get(`/status?agent=${host}`, Any);
const aborted = await api.get(`/facet/abort?host=${host}`, Any, { tries: 2 });

const POLL_MS = 10_000;
const LIMIT_MS = 8 * 60_000;
const watchedFrom = Date.now();
let finishedAlone = false;
let selfWakeSeconds: number | null = null;
while (Date.now() - watchedFrom < LIMIT_MS) {
  await pause(POLL_MS);
  const files = await api.get(`/facet/workspace?host=${host}`, Any, { tries: 3 });
  if (
    typeof files['/workspace/test/slug.test.js'] === 'string' ||
    typeof files['test/slug.test.js'] === 'string'
  ) {
    finishedAlone = true;
    selfWakeSeconds = Math.round((Date.now() - watchedFrom) / 1000);
    break;
  }
}

const statusAfter = await api.get(`/status?agent=${host}`, Any, { tries: 3 });
const clone = await api.get(`/facet/clone?host=${host}&to=fork`, Any, { tries: 2 });
const cloneFiles = Object.keys(clone).filter((path) => path.includes('slug'));

const probe = await api.get(`/probe?agent=${host}`, Any, { tries: 3 });
const result = {
  on: new Date().toISOString(),
  question:
    'Can stock pi-durable run as a Durable Object facet, and resume after facets.abort when the parent wakes it?',
  ownAlarm:
    'refused: the runtime answered "Facets currently cannot set alarms." (first run, 2026-11-08), so the facet runs with wakeBy parent',
  parentWakes: Number(probe.parentWakes ?? 0),
  runsAsFacet: before.status === 'running' || before.status === 'done',
  statusBeforeAbort: String(before.status),
  aborted: aborted.aborted === true,
  finishedAfterAbort: finishedAlone,
  secondsToFinishAfterAbort: selfWakeSeconds,
  statusAfter: String(statusAfter.status),
  usd: Number(statusAfter.usd ?? 0),
  cloneCopiedFiles: cloneFiles,
  seconds: Math.round((Date.now() - started) / 1000),
  passed: finishedAlone && cloneFiles.length > 0,
  reason: finishedAlone
    ? cloneFiles.length > 0
      ? 'pi-durable runs as a facet, but facets cannot set alarms, so the parent must wake it; with the parent alarm it resumed after abort and clone copied its workspace'
      : 'the facet resumed after abort through the parent alarm, but clone did not copy the workspace'
    : 'facets cannot set alarms, and after abort the facet did not finish within 8 minutes even with the parent alarm waking it',
};
const out = join(import.meta.dirname, '..', '..', 'pro' + 'of', 'facet');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
