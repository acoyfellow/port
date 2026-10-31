import { type AgentEnv, piAgent } from '../../kit/agent.ts';
import { MemoryExecutionEnv, sqliteFileStore } from '../../kit/memory-env.ts';
import { piRouter } from '../../kit/router.ts';

type Env = AgentEnv & { readonly SESSION: DurableObjectNamespace<Session> };

export class Session extends piAgent<Env>({
  name: 'durable-session',
  instructions:
    'You are a Pi coding agent whose whole session lives in one Durable Object. Your workspace is /workspace, stored in the same SQLite database as your transcript. Do the work with the tools, check it, then reply in one short sentence.',
  environment: (_env, ctx) =>
    new MemoryExecutionEnv({
      id: `durable-session:${ctx.id.toString()}`,
      cwd: '/workspace',
      store: sqliteFileStore(ctx.storage.sql, 'workspace'),
    }),
  probe: async (_env, ctx) => ({
    facts: {
      tables: ctx.storage.sql
        .exec<{ tables: number }>("SELECT COUNT(*) AS tables FROM sqlite_master WHERE type = 'table'")
        .one().tables,
    },
  }),
}) {}

export default piRouter<Env>({
  shape: 'durable-session',
  agent: (env, name) => env.SESSION.get(env.SESSION.idFromName(name)),
  gateway: (env) => env.GATEWAY,
});
