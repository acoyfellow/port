import { WorkerEntrypoint } from 'cloudflare:workers';

export type QueryEnv = { readonly DB: D1Database };

const ROW_LIMIT = 200;
const WRITE_OPCODES = new Set([
  'Insert',
  'IdxInsert',
  'Delete',
  'IdxDelete',
  'Clear',
  'Destroy',
  'CreateBtree',
  'DropTable',
  'DropIndex',
  'DropTrigger',
  'ParseSchema',
  'SetCookie',
  'VUpdate',
  'Vacuum',
  'Program',
  'JournalMode',
]);

export type QueryResult =
  | { readonly rows: readonly Record<string, unknown>[]; readonly truncated: boolean }
  | { readonly refused: string };

type PlanRow = { readonly opcode: string; readonly p1: number };

const plan = async (db: D1Database, sql: string) => {
  const result = await db.prepare(`EXPLAIN ${sql}`).all<PlanRow>();
  return result.results;
};

const CURSOR_WRITES = new Set(['Insert', 'IdxInsert', 'Delete', 'IdxDelete']);
const OPEN_WRITE = 'OpenWrite';

const writesIn = (rows: readonly PlanRow[]) => {
  const writable = new Set(rows.filter((row) => row.opcode === OPEN_WRITE).map((row) => row.p1));
  return [
    ...new Set(
      rows
        .filter(
          (row) =>
            row.opcode === OPEN_WRITE ||
            (WRITE_OPCODES.has(row.opcode) && !CURSOR_WRITES.has(row.opcode)) ||
            (CURSOR_WRITES.has(row.opcode) && writable.has(row.p1)),
        )
        .map((row) => row.opcode),
    ),
  ];
};

export class ReadOnly extends WorkerEntrypoint<QueryEnv> {
  async query(sql: string): Promise<QueryResult> {
    const text = sql.trim().replace(/;\s*$/, '');
    if (text === '') return { refused: 'empty query' };
    if (text.includes(';')) return { refused: 'one statement at a time' };
    const rows = await plan(this.env.DB, text).catch((error: unknown) => {
      throw new Error(`could not plan the query: ${String(error)}`);
    });
    const writes = writesIn(rows);
    if (writes.length > 0) return { refused: `read-only: the query plan writes (${writes.join(', ')})` };
    const result = await this.env.DB.prepare(text).all<Record<string, unknown>>();
    if ((result.meta.changes ?? 0) > 0) return { refused: 'read-only: the query changed rows' };
    return { rows: result.results.slice(0, ROW_LIMIT), truncated: result.results.length > ROW_LIMIT };
  }

  async fingerprint() {
    const rows = await this.env.DB.prepare(
      "SELECT (SELECT COUNT(*) FROM customers) AS customers, (SELECT COUNT(*) FROM orders) AS orders, (SELECT COALESCE(SUM(total_cents), 0) FROM orders) AS cents, (SELECT group_concat(name, ',') FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE '\\_%' ESCAPE '\\') AS tables",
    ).first<{ customers: number; orders: number; cents: number; tables: string }>();
    return rows ?? { customers: 0, orders: 0, cents: 0, tables: '' };
  }
}

export default {
  async fetch() {
    return new Response('not found', { status: 404 });
  },
} satisfies ExportedHandler<QueryEnv>;
