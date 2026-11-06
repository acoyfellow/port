import { defineExtension, hook, ToolTask } from '@earendil-works/pi-durable';
import { type AgentEnv, piAgent } from '../../kit/agent.ts';
import { MemoryExecutionEnv, sqliteFileStore } from '../../kit/memory-env.ts';
import { piRouter } from '../../kit/router.ts';
import { MARK, type Reader } from '../recorder/index.ts';

type Env = AgentEnv & {
  readonly SESSION: DurableObjectNamespace<Session>;
  readonly READER: Service<Reader>;
};

const announce = (agent: string) =>
  defineExtension({
    name: 'flight-log',
    hooks: [
      hook(ToolTask, {
        beforeTool: (call) => {
          console.log(`${MARK} ${JSON.stringify({ agent, tool: call.name, callId: call.id })}`);
          return undefined;
        },
      }),
    ],
  });

const agentName = (ctx: DurableObjectState) => ctx.id.toString();

export class Session extends piAgent<Env>({
  name: 'flight-recorder',
  instructions:
    'You are a coding agent with an in-memory workspace in /workspace. Use the tools to do the work, check it, then reply in one short sentence.',
  environment: (_env, ctx) =>
    new MemoryExecutionEnv({
      id: `flight-recorder:${ctx.id.toString()}`,
      cwd: '/workspace',
      store: sqliteFileStore(ctx.storage.sql, 'workspace'),
    }),
  extensions: (_env, ctx) => [announce(agentName(ctx))],
}) {
  async flight() {
    const piCalls = await this.toolCalls();
    const recorded = await this.env.READER.calls(agentName(this.ctx));
    return {
      piToolCalls: piCalls.length,
      recordedCalls: recorded.length,
      piTools: piCalls.join(','),
      recordedTools: recorded.map((call) => call.tool).join(','),
      traces: await this.env.READER.traces(),
      agentHasRecorder: Reflect.has(this.env, 'TAPE'),
    };
  }
}

const flightRoute = async (request: Request, env: Env) => {
  const url = new URL(request.url);
  if (url.pathname !== '/flight') return undefined;
  const agent = url.searchParams.get('agent') ?? '';
  if (!/^[a-z0-9-]{1,64}$/.test(agent)) return Response.json({ error: 'agent is required' }, { status: 400 });
  return Response.json(await env.SESSION.get(env.SESSION.idFromName(agent)).flight());
};

export default piRouter<Env>({
  shape: 'flight-recorder',
  agent: (env, name) => env.SESSION.get(env.SESSION.idFromName(name)),
  gateway: (env) => env.GATEWAY,
  extra: flightRoute,
});
