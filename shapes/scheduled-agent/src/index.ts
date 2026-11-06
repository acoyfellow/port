import { DurableObject } from 'cloudflare:workers';
import { type AgentEnv, piAgent } from '../../kit/agent.ts';
import { MemoryExecutionEnv, sqliteFileStore } from '../../kit/memory-env.ts';
import { piRouter } from '../../kit/router.ts';

type Env = AgentEnv & {
  readonly AGENT: DurableObjectNamespace<Agent>;
  readonly CLOCK: DurableObjectNamespace<Clock>;
};

const INTERVAL_MS = 20_000;
const MAX_TICKS = 3;
const NAME = /^[a-z0-9-]{1,64}$/;

const tickPrompt = (n: number, at: string) =>
  `Scheduled check ${n} at ${at}. Append one line "tick ${n} ${at}" to /workspace/log.txt (create it if needed), then reply with the number of lines now in the file.`;

export class Clock extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS ticks (n INTEGER PRIMARY KEY, at INTEGER, request TEXT, by_alarm INTEGER)',
    );
  }

  async start(agent: string) {
    await this.ctx.storage.put('agent', agent);
    await this.ctx.storage.setAlarm(Date.now() + INTERVAL_MS);
    return { scheduledIn: INTERVAL_MS };
  }

  override async alarm() {
    const agent = await this.ctx.storage.get<string>('agent');
    if (agent === undefined) return;
    const n = this.ctx.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM ticks').one().n + 1;
    const at = new Date().toISOString();
    const request = `tick:${n}`;
    await this.env.AGENT.get(this.env.AGENT.idFromName(agent)).submit(tickPrompt(n, at), request);
    this.ctx.storage.sql.exec(
      'INSERT INTO ticks (n, at, request, by_alarm) VALUES (?, ?, ?, 1)',
      n,
      Date.now(),
      request,
    );
    if (n < MAX_TICKS) await this.ctx.storage.setAlarm(Date.now() + INTERVAL_MS);
  }

  async ticks() {
    const rows = this.ctx.storage.sql
      .exec<{ n: number; at: number; request: string }>('SELECT n, at, request FROM ticks ORDER BY n')
      .toArray();
    return { ticks: rows, next: await this.ctx.storage.getAlarm() };
  }
}

const files = (ctx: DurableObjectState) => sqliteFileStore(ctx.storage.sql, 'workspace');

export class Agent extends piAgent<Env>({
  name: 'scheduled-agent',
  instructions:
    'You are a background agent that wakes on a schedule. You have an in-memory workspace in /workspace. Do the scheduled job with the tools, then reply in one short sentence.',
  environment: (_env, ctx) =>
    new MemoryExecutionEnv({
      id: `scheduled-agent:${ctx.id.toString()}`,
      cwd: '/workspace',
      store: files(ctx),
    }),
}) {}

const clock = (env: Env, agent: string) => env.CLOCK.get(env.CLOCK.idFromName(agent));

const scheduleRoute = async (request: Request, env: Env) => {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/schedule')) return undefined;
  const agent = url.searchParams.get('agent') ?? '';
  if (!NAME.test(agent)) return Response.json({ error: 'agent is required' }, { status: 400 });
  if (url.pathname === '/schedule/start' && request.method === 'POST')
    return Response.json(await clock(env, agent).start(agent));
  if (url.pathname === '/schedule') return Response.json(await clock(env, agent).ticks());
  return Response.json({ error: 'not found' }, { status: 404 });
};

export default piRouter<Env>({
  shape: 'scheduled-agent',
  agent: (env, name) => env.AGENT.get(env.AGENT.idFromName(name)),
  gateway: (env) => env.GATEWAY,
  extra: scheduleRoute,
});
