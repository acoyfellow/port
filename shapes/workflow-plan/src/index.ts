import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { type AgentEnv, piAgent } from '../../kit/agent.ts';
import { MemoryExecutionEnv, sqliteFileStore } from '../../kit/memory-env.ts';
import { piRouter } from '../../kit/router.ts';

type Env = AgentEnv & {
  readonly PLANNER: DurableObjectNamespace<Planner>;
  readonly PLAN: Workflow<PlanParams>;
};

type PlanParams = { readonly agent: string; readonly failOnce: number };

const STEP_POLL_MS = 3000;
const STEP_POLLS = 100;
const NAME = /^[a-z0-9-]{1,64}$/;
const PLAN_PATH = '/workspace/plan.json';
const decoder = new TextDecoder();

const files = (ctx: DurableObjectState) => sqliteFileStore(ctx.storage.sql, 'workspace');

const stepsOf = (ctx: DurableObjectState): string[] => {
  const bytes = files(ctx).load()[PLAN_PATH];
  if (bytes === undefined) return [];
  const parsed: unknown = JSON.parse(decoder.decode(bytes));
  const steps = Array.isArray(parsed) ? parsed : Reflect.get(Object(parsed), 'steps');
  return Array.isArray(steps) ? steps.map(String).slice(0, 6) : [];
};

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class Planner extends piAgent<Env>({
  name: 'workflow-plan',
  instructions:
    'You are a coding agent with an in-memory workspace in /workspace. Each message is one step of a plan or a planning request. Do exactly that step with the tools, check it, then reply in one short sentence.',
  environment: (_env, ctx) =>
    new MemoryExecutionEnv({
      id: `workflow-plan:${ctx.id.toString()}`,
      cwd: '/workspace',
      store: files(ctx),
    }),
}) {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS attempts (id INTEGER PRIMARY KEY, step INTEGER, outcome TEXT, at INTEGER)',
    );
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS completed (step INTEGER PRIMARY KEY, text TEXT, at INTEGER)',
    );
  }

  async plan() {
    return stepsOf(this.ctx);
  }

  async attempt(step: number, outcome: string) {
    this.ctx.storage.sql.exec(
      'INSERT INTO attempts (step, outcome, at) VALUES (?, ?, ?)',
      step,
      outcome,
      Date.now(),
    );
  }

  async runStep(step: number, text: string) {
    const done = this.ctx.storage.sql
      .exec<{ text: string }>('SELECT text FROM completed WHERE step = ?', step)
      .toArray()[0];
    if (done !== undefined) return { step, reused: true, text: done.text };
    const requestId = `step:${step}`;
    const prompt = `Plan step ${step + 1}: ${text}`;
    await this.submit(prompt, requestId);
    for (let poll = 0; poll < STEP_POLLS; poll++) {
      const status = await this.status(requestId, prompt);
      if (status.status !== 'running') {
        if (status.status !== 'done') throw new Error(`step ${step + 1} ended ${status.status}`);
        this.ctx.storage.sql.exec(
          'INSERT INTO completed (step, text, at) VALUES (?, ?, ?)',
          step,
          status.text,
          Date.now(),
        );
        return { step, reused: false, text: status.text };
      }
      await pause(STEP_POLL_MS);
    }
    throw new Error(`step ${step + 1} did not finish in time`);
  }

  async ledger() {
    const attempts = this.ctx.storage.sql
      .exec<{ step: number; outcome: string }>('SELECT step, outcome FROM attempts ORDER BY id')
      .toArray();
    const completed = this.ctx.storage.sql
      .exec<{ step: number }>('SELECT step FROM completed ORDER BY step')
      .toArray()
      .map((row) => row.step);
    return { attempts, completed, plan: stepsOf(this.ctx) };
  }
}

const planner = (env: Env, agent: string) => env.PLANNER.get(env.PLANNER.idFromName(agent));

export class PlanWorkflow extends WorkflowEntrypoint<Env, PlanParams> {
  override async run(event: Readonly<WorkflowEvent<PlanParams>>, step: WorkflowStep) {
    const { agent, failOnce } = event.payload;
    const steps = await step.do('read plan', async () => planner(this.env, agent).plan());
    const results: string[] = [];
    for (const [index, text] of steps.entries()) {
      const result = await step.do(
        `step ${index + 1}`,
        { retries: { limit: 3, delay: '2 seconds', backoff: 'constant' }, timeout: '10 minutes' },
        async () => {
          const target = planner(this.env, agent);
          const earlier = (await target.ledger()).attempts.filter((row) => row.step === index).length;
          if (index === failOnce && earlier === 0) {
            await target.attempt(index, 'failed on purpose');
            throw new Error(`step ${index + 1} failed on purpose before doing any work`);
          }
          await target.attempt(index, 'ran');
          return (await target.runStep(index, text)).text;
        },
      );
      results.push(result);
    }
    return { steps: steps.length, results };
  }
}

const planRoute = async (request: Request, env: Env) => {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/plan')) return undefined;
  const agent = url.searchParams.get('agent') ?? '';
  if (!NAME.test(agent)) return Response.json({ error: 'agent is required' }, { status: 400 });
  if (url.pathname === '/plan/start' && request.method === 'POST') {
    const instance = await env.PLAN.create({ id: `plan-${agent}`, params: { agent, failOnce: 1 } });
    return Response.json({ instance: instance.id });
  }
  if (url.pathname === '/plan') {
    const instance = await env.PLAN.get(`plan-${agent}`);
    const status = await instance.status();
    return Response.json({
      workflow: status.status,
      error: status.error?.message ?? '',
      ...(await planner(env, agent).ledger()),
    });
  }
  return Response.json({ error: 'not found' }, { status: 404 });
};

export default piRouter<Env>({
  shape: 'workflow-plan',
  agent: (env, name) => planner(env, name),
  gateway: (env) => env.GATEWAY,
  extra: planRoute,
});
