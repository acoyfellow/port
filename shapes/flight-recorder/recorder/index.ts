import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';

export type RecorderEnv = { readonly TAPE: DurableObjectNamespace<Tape> };

export const MARK = 'port-flight';

export type Recorded = {
  readonly agent: string;
  readonly tool: string;
  readonly callId: string;
  readonly at: number;
};

export class Tape extends DurableObject<RecorderEnv> {
  constructor(ctx: DurableObjectState, env: RecorderEnv) {
    super(ctx, env);
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS calls (call_id TEXT PRIMARY KEY, agent TEXT, tool TEXT, at INTEGER, script TEXT)',
    );
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS traces (id INTEGER PRIMARY KEY, script TEXT, outcome TEXT, at INTEGER)',
    );
  }

  record(calls: readonly Recorded[], script: string, outcome: string) {
    this.ctx.storage.sql.exec(
      'INSERT INTO traces (script, outcome, at) VALUES (?, ?, ?)',
      script,
      outcome,
      Date.now(),
    );
    for (const call of calls)
      this.ctx.storage.sql.exec(
        'INSERT OR IGNORE INTO calls (call_id, agent, tool, at, script) VALUES (?, ?, ?, ?, ?)',
        call.callId,
        call.agent,
        call.tool,
        call.at,
        script,
      );
  }

  calls(agent: string) {
    return this.ctx.storage.sql
      .exec<{ tool: string; call_id: string }>(
        'SELECT tool, call_id FROM calls WHERE agent = ? ORDER BY at',
        agent,
      )
      .toArray()
      .map((row) => ({ tool: row.tool, callId: row.call_id }));
  }

  traces() {
    return this.ctx.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM traces').one().n;
  }
}

const tape = (env: RecorderEnv) => env.TAPE.get(env.TAPE.idFromName('tape'));

const field = (value: unknown, key: string) =>
  typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;

const recordedOf = (log: TraceLog): Recorded | undefined => {
  const [first] = Array.isArray(log.message) ? log.message : [log.message];
  if (typeof first !== 'string' || !first.startsWith(`${MARK} `)) return undefined;
  const parsed: unknown = JSON.parse(first.slice(MARK.length + 1));
  const agent = field(parsed, 'agent');
  const tool = field(parsed, 'tool');
  const callId = field(parsed, 'callId');
  if (typeof agent !== 'string' || typeof tool !== 'string' || typeof callId !== 'string') return undefined;
  return { agent, tool, callId, at: log.timestamp };
};

export class Reader extends WorkerEntrypoint<RecorderEnv> {
  async calls(agent: string) {
    return tape(this.env).calls(agent);
  }

  async traces() {
    return tape(this.env).traces();
  }
}

export default {
  async fetch() {
    return new Response('not found', { status: 404 });
  },
  async tail(events, env) {
    const recorder = tape(env);
    for (const event of events) {
      const calls = event.logs.flatMap((log) => {
        const recorded = recordedOf(log);
        return recorded === undefined ? [] : [recorded];
      });
      await recorder.record(calls, event.scriptName ?? '', event.outcome);
    }
  },
} satisfies ExportedHandler<RecorderEnv>;
