import { runPiSmoke } from '../kit/pi-smoke.ts';
import { type Client, pause } from '../kit/smoke.ts';

const WAIT_TRIES = 90;

const field = (value: unknown, key: string) =>
  typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;

type Attempt = { readonly step: number; readonly outcome: string };

const isAttempts = (value: unknown): value is Attempt[] =>
  Array.isArray(value) && value.every((row) => typeof field(row, 'step') === 'number');

const runPlan = async (api: Client, agent: string) => {
  await api.raw('POST', `/plan/start?agent=${agent}`);
  let last: unknown = {};
  for (let attempt = 0; attempt < WAIT_TRIES; attempt++) {
    await pause(4000);
    last = (await api.raw('GET', `/plan?agent=${agent}`)).json;
    const state = String(field(last, 'workflow'));
    if (state === 'complete' || state === 'errored' || state === 'terminated') break;
  }
  const attempts = isAttempts(field(last, 'attempts')) ? field(last, 'attempts') : [];
  const rows = isAttempts(attempts) ? attempts : [];
  const plan = field(last, 'plan');
  const steps = Array.isArray(plan) ? plan.length : 0;
  const completed = field(last, 'completed');
  const ranPerStep = Array.from(
    { length: steps },
    (_, step) => rows.filter((row) => row.step === step && row.outcome === 'ran').length,
  );
  return {
    workflow: String(field(last, 'workflow')),
    planSteps: steps,
    completedSteps: Array.isArray(completed) ? completed.length : 0,
    failedOnPurpose: rows.filter((row) => row.outcome === 'failed on purpose').length,
    retriedStep: rows.some((row) => row.step === 1 && row.outcome === 'ran'),
    maxRunsPerStep: Math.max(0, ...ranPerStep),
    attempts: rows.map((row) => `${row.step + 1}:${row.outcome === 'ran' ? 'ran' : 'failed'}`).join(','),
    workflowError: String(field(last, 'error')),
  };
};

await runPiSmoke({
  slug: 'workflow-plan',
  restartAfterMs: 5000,
  task: {
    prompt:
      'Plan a tiny Python project in three steps and write the plan to /workspace/plan.json as {"steps": ["...", "...", "..."]}. Step 1 writes greet.py with greet(name) returning "Hello, <name>!", step 2 writes test_greet.py with two asserts, step 3 writes README.md saying how to run the tests. Only write plan.json now; do not do the steps. Reply in one short sentence.',
    passed: (files) => (files['plan.json'] ?? '').includes('steps'),
    describe:
      'planned three steps, then a Workflow ran each step as its own durable step with one forced retry',
  },
  afterTask: runPlan,
  infrastructure: (probe) => ({
    ok:
      String(probe.workflow) === 'complete' &&
      Number(probe.planSteps) === 3 &&
      Number(probe.completedSteps) === 3 &&
      Number(probe.failedOnPurpose) === 1 &&
      probe.retriedStep === true &&
      Number(probe.maxRunsPerStep) === 1,
    claim: `A Cloudflare Workflow ran Pi's ${String(probe.planSteps)}-step plan as durable steps and finished "${String(probe.workflow)}". Step 2 failed once on purpose and the Workflow retried it on its own. Attempts: ${String(probe.attempts)}. No step's work ran twice.`,
  }),
});
