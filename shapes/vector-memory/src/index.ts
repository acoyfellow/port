import { Type } from '@earendil-works/pi-ai';
import { defineExtension, defineTool } from '@earendil-works/pi-durable';
import { type AgentEnv, piAgent } from '../../kit/agent.ts';
import { MemoryExecutionEnv, sqliteFileStore } from '../../kit/memory-env.ts';
import { piRouter } from '../../kit/router.ts';

type Env = AgentEnv & {
  readonly SESSION: DurableObjectNamespace<Session>;
  readonly MEMORY: VectorizeIndex;
};

const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';
const RECALL_LIMIT = 5;
const NAMESPACE = 'shared';

const embed = async (env: Env, text: string) => {
  const result = await env.AI.run(EMBEDDING_MODEL, { text: [text] });
  const vector = 'data' in result ? result.data?.[0] : undefined;
  if (vector === undefined) throw new Error('no embedding returned');
  return vector;
};

const fingerprint = async (text: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
    .slice(0, 12)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const memoryTools = (env: Env, ctx: DurableObjectState) =>
  defineExtension({
    name: 'memory',
    tools: [
      defineTool({
        name: 'remember',
        description:
          'Store one fact in long-term memory. Memory is shared by every session of this agent and outlives this conversation. Store one short self-contained sentence per call.',
        parameters: Type.Object({ fact: Type.String() }),
        execute: async (input) => {
          const id = await fingerprint(input.fact);
          await env.MEMORY.upsert([
            {
              id,
              values: await embed(env, input.fact),
              namespace: NAMESPACE,
              metadata: { fact: input.fact, session: ctx.id.toString() },
            },
          ]);
          ctx.storage.sql.exec('INSERT OR IGNORE INTO stored (id, fact) VALUES (?, ?)', id, input.fact);
          return { output: [{ type: 'text', text: `remembered (${id})` }] };
        },
      }),
      defineTool({
        name: 'recall',
        description:
          'Search long-term memory for facts related to a question. Returns the closest stored facts.',
        parameters: Type.Object({ question: Type.String() }),
        execute: async (input) => {
          const result = await env.MEMORY.query(await embed(env, input.question), {
            topK: RECALL_LIMIT,
            namespace: NAMESPACE,
            returnMetadata: 'all',
          });
          const facts = result.matches.map((match) => ({
            fact: String(match.metadata?.fact ?? ''),
            fromSession: String(match.metadata?.session ?? ''),
            score: Math.round(match.score * 1000) / 1000,
          }));
          ctx.storage.sql.exec(
            'INSERT INTO searches (question, hits) VALUES (?, ?)',
            input.question,
            facts.length,
          );
          for (const fact of facts)
            ctx.storage.sql.exec(
              'INSERT INTO recalled (fact, from_session) VALUES (?, ?)',
              fact.fact,
              fact.fromSession,
            );
          return { output: [{ type: 'text', text: JSON.stringify(facts) }] };
        },
      }),
    ],
  });

export class Session extends piAgent<Env>({
  name: 'vector-memory',
  instructions:
    'You are an assistant with long-term memory that outlives this conversation. Store facts the user wants kept with remember. You do not know anything about the user or their projects from this chat alone: before answering any question about them, always call recall first, then answer from what it returns. You also have an in-memory workspace in /workspace. Reply in one short sentence.',
  environment: (_env, ctx) =>
    new MemoryExecutionEnv({
      id: `vector-memory:${ctx.id.toString()}`,
      cwd: '/workspace',
      store: sqliteFileStore(ctx.storage.sql, 'workspace'),
    }),
  extensions: (env, ctx) => [memoryTools(env, ctx)],
  probe: async (_env, ctx) => {
    const stored = ctx.storage.sql.exec<{ fact: string }>('SELECT fact FROM stored').toArray();
    const recalled = ctx.storage.sql
      .exec<{ fact: string; from_session: string }>('SELECT fact, from_session FROM recalled')
      .toArray();
    return {
      facts: {
        session: ctx.id.toString(),
        stored: stored.length,
        storedFacts: stored
          .map((row) => row.fact)
          .join(' | ')
          .slice(0, 300),
        recalled: recalled.length,
        recalledFromOther: recalled.filter((row) => row.from_session !== ctx.id.toString()).length,
        recalledFacts: [...new Set(recalled.map((row) => row.fact))].join(' | ').slice(0, 300),
        searches: ctx.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM searches').one().n,
      },
    };
  },
}) {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS stored (id TEXT PRIMARY KEY, fact TEXT)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS recalled (fact TEXT, from_session TEXT)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS searches (question TEXT, hits INTEGER)');
  }

  async searchable(question: string) {
    const result = await this.env.MEMORY.query(await embed(this.env, question), {
      topK: RECALL_LIMIT,
      namespace: NAMESPACE,
    });
    return result.matches.length;
  }
}

const searchableRoute = async (request: Request, env: Env) => {
  const url = new URL(request.url);
  if (url.pathname !== '/searchable') return undefined;
  const agent = url.searchParams.get('agent') ?? '';
  if (!/^[a-z0-9-]{1,64}$/.test(agent)) return Response.json({ error: 'agent is required' }, { status: 400 });
  const matches = await env.SESSION.get(env.SESSION.idFromName(agent)).searchable(
    url.searchParams.get('q') ?? 'project',
  );
  return Response.json({ matches });
};

export default piRouter<Env>({
  shape: 'vector-memory',
  agent: (env, name) => env.SESSION.get(env.SESSION.idFromName(name)),
  gateway: (env) => env.GATEWAY,
  extra: searchableRoute,
});
