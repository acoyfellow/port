import { type AgentEnv, piAgent } from '../../kit/agent.ts';
import { boxBoot, containerEnv, runInBox } from '../../kit/container-env.ts';
import { piRouter } from '../../kit/router.ts';

type Env = AgentEnv & { readonly BOX: DurableObjectNamespace<Box> };

const SEALED = { internet: false } as const;

export class Box extends piAgent<Env>({
  name: 'sealed-box',
  instructions:
    'You work in a sealed Linux box: a shell, Python and Node in /workspace, and no internet. Do the task with the tools, check it, then reply in one short sentence.',
  environment: (_env, ctx) => containerEnv(ctx, `sealed:${ctx.id.toString()}`, SEALED),
  probe: async (_env, ctx) => {
    const env = containerEnv(ctx, `sealed:${ctx.id.toString()}`, SEALED);
    const outbound = await runInBox(env, [
      'node',
      '-e',
      "fetch('https://example.com').then(() => console.log('reached'), () => console.log('blocked'))",
    ]);
    return { facts: { boot: await boxBoot(ctx, SEALED), outbound: outbound.output } };
  },
}) {}

export default piRouter<Env>({
  shape: 'sealed-box',
  agent: (env, name) => env.BOX.get(env.BOX.idFromName(name)),
  gateway: (env) => env.GATEWAY,
});
