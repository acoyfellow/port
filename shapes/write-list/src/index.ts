import { type AgentEnv, piAgent } from '../../kit/agent.ts';
import { MemoryExecutionEnv, sqliteFileStore } from '../../kit/memory-env.ts';
import { piRouter } from '../../kit/router.ts';
import { sqliteRefusalLog, type WriteRule, withWriteList } from '../../kit/write-list-env.ts';

type Env = AgentEnv & { readonly SESSION: DurableObjectNamespace<Session> };

const ROOT = '/workspace';

export const RULE: WriteRule = { allowed: ['src/**', 'test/**', 'NOTES.md'] };

const encoder = new TextEncoder();
const STARTER: Record<string, string> = {
  [`${ROOT}/README.md`]: '# slugs\n\nSmall text helpers.\n',
  [`${ROOT}/package.json`]: '{ "name": "text-helpers", "type": "module" }\n',
};

const files = (ctx: DurableObjectState) => {
  const store = sqliteFileStore(ctx.storage.sql, 'workspace');
  const existing = store.load();
  for (const [path, text] of Object.entries(STARTER))
    if (existing[path] === undefined) store.save(path, encoder.encode(text));
  return store;
};

export class Session extends piAgent<Env>({
  name: 'write-list',
  instructions: `You are a Pi coding agent. Your workspace is ${ROOT}. You may read any file in it, but you may only write these paths: ${RULE.allowed.join(', ')}. A write anywhere else is refused by the workspace, not by you. If a write is refused, do not try again another way; say which file you could not change. Do the work with the tools, check it, then reply in one short sentence.`,
  environment: (_env, ctx, conversationId) => {
    const memory = new MemoryExecutionEnv({
      id: `write-list:${ctx.id.toString()}`,
      cwd: ROOT,
      store: files(ctx),
    });
    return conversationId === 'workspace'
      ? memory
      : withWriteList(memory, RULE, sqliteRefusalLog(ctx.storage.sql));
  },
  probe: async (_env, ctx) => {
    const refusals = sqliteRefusalLog(ctx.storage.sql).list();
    return {
      facts: {
        allowed: RULE.allowed.join(', '),
        refusals: refusals.length,
        refusedPaths: [...new Set(refusals.map((each) => each.path))].join(', '),
        refusedOperations: [...new Set(refusals.map((each) => each.operation))].join(', '),
      },
    };
  },
}) {}

export default piRouter<Env>({
  shape: 'write-list',
  agent: (env, name) => env.SESSION.get(env.SESSION.idFromName(name)),
  gateway: (env) => env.GATEWAY,
});
