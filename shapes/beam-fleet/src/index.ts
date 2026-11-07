import { type AgentEnv, piAgent } from '../../kit/agent.ts';
import { type Fleet, fleetOf, seatEnv, seatFacts, seatOf } from '../../kit/beam.ts';
import { piRouter } from '../../kit/router.ts';

export { Fleet } from '../../kit/beam.ts';

type Env = AgentEnv & {
  readonly SEAT: DurableObjectNamespace<Seat>;
  readonly BOX: DurableObjectNamespace<Fleet>;
};

const SLUG = 'beam-fleet';

export class Seat extends piAgent<Env>({
  name: SLUG,
  instructions:
    'You are one of five coding agents in one Linux container. A BEAM supervisor runs your tools as your own Unix user and restarts them if they crash; you cannot read the other agents. Your home directory is your workspace. If a tool call fails because your tools restarted, run it again. Do the task with the tools, check it, then reply in one short sentence.',
  environment: (env, ctx) => seatEnv(env.BOX, SLUG, seatOf(ctx.id.toString()), ctx.id.toString()),
  probe: async (env, ctx) => ({ facts: await seatFacts(env.BOX, SLUG, ctx.id.toString()) }),
}) {}

const json = (body: unknown, status = 200) => Response.json(body, { status });

export default piRouter<Env>({
  shape: SLUG,
  agent: (env, name) => env.SEAT.get(env.SEAT.idFromName(name)),
  gateway: (env) => env.GATEWAY,
  extra: async (request, env) => {
    const url = new URL(request.url);
    if (url.pathname === '/fleet') return json(await fleetOf(env.BOX).state());
    const kill = /^\/fleet\/kill\/([1-5])$/.exec(url.pathname);
    if (kill !== null && request.method === 'POST') return json(await fleetOf(env.BOX).kill(Number(kill[1])));
    return undefined;
  },
});
