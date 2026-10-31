import { type AgentEnv, piAgent } from '../../kit/agent.ts';
import { boxBoot, containerEnv } from '../../kit/container-env.ts';
import { piRouter } from '../../kit/router.ts';

type Env = AgentEnv & { readonly THREAD: DurableObjectNamespace<Thread> };

const BOX = { internet: true } as const;

export class Thread extends piAgent<Env>({
  name: 'container-per-thread',
  instructions:
    'You are a coding agent with your own Linux computer: a shell, git, Python, Node and a disk in /workspace. Use the tools to do the work, check it, then reply in one short sentence.',
  environment: (_env, ctx) => containerEnv(ctx, `container:${ctx.id.toString()}`, BOX),
  probe: async (_env, ctx) => ({ facts: { boot: await boxBoot(ctx, BOX), thread: ctx.id.toString() } }),
}) {}

export default piRouter<Env>({
  shape: 'container-per-thread',
  agent: (env, name) => env.THREAD.get(env.THREAD.idFromName(name)),
  gateway: (env) => env.GATEWAY,
});
