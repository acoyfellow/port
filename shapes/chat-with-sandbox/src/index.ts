import { type AgentEnv, piAgent } from '../../kit/agent.ts';
import { boxBoot, containerEnv } from '../../kit/container-env.ts';
import { piRouter } from '../../kit/router.ts';

type Env = AgentEnv & { readonly CHAT: DurableObjectNamespace<Chat> };

const SANDBOX = { internet: false } as const;

export class Chat extends piAgent<Env>({
  name: 'chat-with-sandbox',
  instructions:
    'You are a Pi agent in a chat. You have a private sandbox: a shell, Python and Node in /workspace, with no internet. Use it to do the work, check it, then reply in one short sentence.',
  environment: (_env, ctx) => containerEnv(ctx, `sandbox:${ctx.id.toString()}`, SANDBOX),
  probe: async (_env, ctx) => ({ facts: { boot: await boxBoot(ctx, SANDBOX), chat: ctx.id.toString() } }),
}) {}

export default piRouter<Env>({
  shape: 'chat-with-sandbox',
  agent: (env, name) => env.CHAT.get(env.CHAT.idFromName(name)),
  gateway: (env) => env.GATEWAY,
});
