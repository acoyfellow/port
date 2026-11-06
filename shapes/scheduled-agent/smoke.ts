import { runPiSmoke } from '../kit/pi-smoke.ts';
import { type Client, pause } from '../kit/smoke.ts';

const WANTED_TICKS = 2;
const WAIT_TRIES = 45;

const field = (value: unknown, key: string) =>
  typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;

const logLines = (files: unknown) => {
  const log = field(files, 'log.txt');
  return typeof log === 'string' ? log.split('\n').filter((line) => line.startsWith('tick ')) : [];
};

const waitForTicks = async (api: Client, agent: string) => {
  const started = await api.raw('POST', `/schedule/start?agent=${agent}`);
  let ticks: unknown[] = [];
  let lines: string[] = [];
  for (let attempt = 0; attempt < WAIT_TRIES; attempt++) {
    await pause(4000);
    const schedule = (await api.raw('GET', `/schedule?agent=${agent}`)).json;
    const found = field(schedule, 'ticks');
    ticks = Array.isArray(found) ? found : [];
    lines = logLines((await api.raw('GET', `/files?agent=${agent}`)).json);
    if (ticks.length >= WANTED_TICKS && lines.length >= WANTED_TICKS) break;
  }
  return {
    scheduledIn: Number(field(started.json, 'scheduledIn')),
    scheduledRuns: ticks.length,
    loggedTicks: lines.length,
    log: lines.join(' | '),
  };
};

await runPiSmoke({
  slug: 'scheduled-agent',
  restartAfterMs: 5000,
  task: {
    prompt:
      'Set up the job: write /workspace/job.md with one line that says "append a tick line to log.txt on every scheduled check". Read it back, then reply with one short sentence.',
    passed: (files) => (files['job.md'] ?? '').includes('tick'),
    describe: 'set up a job, then ran it twice on its own, woken by a Durable Object alarm',
  },
  afterTask: waitForTicks,
  infrastructure: (probe) => ({
    ok: Number(probe.scheduledRuns) >= WANTED_TICKS && Number(probe.loggedTicks) >= WANTED_TICKS,
    claim: `After the first task, no request was sent to the agent. A separate clock Durable Object woke it ${String(probe.scheduledRuns)} times by alarm, ${String(Number(probe.scheduledIn) / 1000)} s apart, and Pi wrote ${String(probe.loggedTicks)} tick lines to log.txt (${String(probe.log)}).`,
  }),
});
