import { runPiSmoke } from '../kit/pi-smoke.ts';
import { type Client, pause } from '../kit/smoke.ts';

const code = `ORCA-${Date.now() % 100_000}`;
const WAIT_TRIES = 75;

const field = (value: unknown, key: string) =>
  typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;

const secondSession = async (api: Client, firstAgent: string) => {
  const agent = `${firstAgent}-b`;
  let searchable = 0;
  const waitStarted = Date.now();
  for (let attempt = 0; attempt < 30 && searchable < 2; attempt++) {
    searchable = Number(
      field((await api.raw('GET', `/searchable?agent=${agent}&q=project`)).json, 'matches'),
    );
    if (searchable < 2) await pause(3000);
  }
  const indexWaitMs = Date.now() - waitStarted;
  await api.raw(
    'POST',
    `/run?agent=${agent}`,
    JSON.stringify({
      prompt:
        'What is my project code name, and what database does the project use? Write both to /workspace/recall.md.',
    }),
  );
  let status: unknown = {};
  for (let attempt = 0; attempt < WAIT_TRIES; attempt++) {
    await pause(4000);
    status = (await api.raw('GET', `/status?agent=${agent}`)).json;
    if (field(status, 'status') !== 'running') break;
  }
  const files = (await api.raw('GET', `/files?agent=${agent}`)).json;
  const recall = String(field(files, 'recall.md') ?? '');
  const probe = (await api.raw('GET', `/probe?agent=${agent}`)).json;
  const first = (await api.raw('GET', `/probe?agent=${firstAgent}`)).json;
  return {
    firstStored: Number(field(first, 'stored')),
    firstSession: String(field(first, 'session')),
    secondSession: String(field(probe, 'session')),
    secondStatus: String(field(status, 'status')),
    secondStored: Number(field(probe, 'stored')),
    secondRecalledFromOther: Number(field(probe, 'recalledFromOther')),
    secondRecalledFacts: String(field(probe, 'recalledFacts')),
    secondSearches: Number(field(probe, 'searches')),
    searchableBeforeB: searchable,
    indexWaitMs,
    secondAnswer: recall.slice(0, 200),
    secondAnswerHasCode: recall.includes(code),
    secondAnswerHasDatabase: /d1/i.test(recall),
  };
};

await runPiSmoke({
  slug: 'vector-memory',
  restartAfterMs: 6000,
  task: {
    prompt: `Please remember these for later, one fact per remember call: my project code name is ${code}; the project database is D1; I prefer short answers. Then reply in one short sentence.`,
    passed: (_files, text) => text.trim() !== '',
    describe: 'stored facts in Vectorize; a fresh session with no shared chat recalled them',
  },
  afterTask: secondSession,
  infrastructure: (probe) => ({
    ok:
      Number(probe.firstStored) >= 2 &&
      probe.firstSession !== probe.secondSession &&
      probe.secondStatus === 'done' &&
      Number(probe.secondStored) === 0 &&
      Number(probe.secondRecalledFromOther) >= 1 &&
      probe.secondAnswerHasCode === true &&
      probe.secondAnswerHasDatabase === true,
    claim: `Session A stored ${String(probe.firstStored)} facts in Vectorize. Session B, a separate Durable Object that never saw A's chat and stored nothing itself, recalled ${String(probe.secondRecalledFromOther)} of A's facts by meaning (${String(probe.secondRecalledFacts).slice(0, 160)}) and answered with the code name and the database.`,
  }),
});
