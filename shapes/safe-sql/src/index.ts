import { Type } from '@earendil-works/pi-ai';
import { defineExtension, defineTool } from '@earendil-works/pi-durable';
import { type AgentEnv, piAgent } from '../../kit/agent.ts';
import { MemoryExecutionEnv, sqliteFileStore } from '../../kit/memory-env.ts';
import { piRouter } from '../../kit/router.ts';
import type { ReadOnly } from '../query/index.ts';

type Env = AgentEnv & {
  readonly ANALYST: DurableObjectNamespace<Analyst>;
  readonly SQL: Service<ReadOnly>;
};

const sqlTools = (env: Env, ctx: DurableObjectState) =>
  defineExtension({
    name: 'sql',
    tools: [
      defineTool({
        name: 'query',
        description:
          'Run one SQL statement against the shop database (SQLite dialect, tables customers and orders). The connection is read-only: statements that would change data or schema are refused.',
        parameters: Type.Object({ sql: Type.String() }),
        execute: async (input) => {
          const result = await env.SQL.query(input.sql).catch((error: unknown) => ({
            refused: `error: ${String(error)}`,
          }));
          if ('refused' in result) {
            ctx.storage.sql.exec(
              'INSERT INTO refusals (sql, reason, at) VALUES (?, ?, ?)',
              input.sql,
              result.refused,
              Date.now(),
            );
            return { output: [{ type: 'text', text: `refused: ${result.refused}` }] };
          }
          return { output: [{ type: 'text', text: JSON.stringify(result) }] };
        },
      }),
    ],
  });

export class Analyst extends piAgent<Env>({
  name: 'safe-sql',
  instructions:
    'You are a data analyst. Answer questions about the shop database with the query tool, and write files in /workspace when asked. Reply in one short sentence.',
  environment: (_env, ctx) =>
    new MemoryExecutionEnv({
      id: `safe-sql:${ctx.id.toString()}`,
      cwd: '/workspace',
      store: sqliteFileStore(ctx.storage.sql, 'workspace'),
    }),
  extensions: (env, ctx) => [sqlTools(env, ctx)],
  probe: async (env, ctx) => {
    const refusals = ctx.storage.sql
      .exec<{ sql: string }>('SELECT sql FROM refusals ORDER BY at')
      .toArray()
      .map((row) => row.sql);
    const direct = await env.SQL.query('UPDATE orders SET total_cents = 0 WHERE id = 1').catch(
      (error: unknown) => ({ refused: `error: ${String(error)}` }),
    );
    const drop = await env.SQL.query('DROP TABLE orders').catch((error: unknown) => ({
      refused: `error: ${String(error)}`,
    }));
    const fingerprint = await env.SQL.fingerprint();
    return {
      facts: {
        piRefusals: refusals.length,
        piRefused: refusals.join(' | ').slice(0, 300),
        updateRefused: 'refused' in direct && !direct.refused.startsWith('error'),
        dropRefused: 'refused' in drop && !drop.refused.startsWith('error'),
        customers: fingerprint.customers,
        orders: fingerprint.orders,
        cents: fingerprint.cents,
        tables: fingerprint.tables,
        agentHasDatabase: Reflect.has(env, 'DB'),
      },
    };
  },
}) {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS refusals (sql TEXT, reason TEXT, at INTEGER)');
  }
}

export default piRouter<Env>({
  shape: 'safe-sql',
  agent: (env, name) => env.ANALYST.get(env.ANALYST.idFromName(name)),
  gateway: (env) => env.GATEWAY,
});
