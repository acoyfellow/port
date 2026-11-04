import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';

export type Action = {
  readonly id: number;
  readonly workspace: string;
  readonly to: string;
  readonly subject: string;
  readonly status: 'pending' | 'delivered' | 'rejected';
};

export type GateEnv = {
  readonly LEDGER: DurableObjectNamespace<Ledger>;
  readonly DELIVERY_KEY?: string;
};

const ADDRESS = /^[^\s@]{1,64}@[^\s@]{1,190}$/;

export class Ledger extends DurableObject<GateEnv> {
  constructor(ctx: DurableObjectState, env: GateEnv) {
    super(ctx, env);
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS actions (id INTEGER PRIMARY KEY, workspace TEXT, recipient TEXT, subject TEXT, status TEXT DEFAULT 'pending')",
    );
  }

  queue(workspace: string, to: string, subject: string) {
    this.ctx.storage.sql.exec(
      'INSERT INTO actions (workspace, recipient, subject) VALUES (?, ?, ?)',
      workspace,
      to,
      subject,
    );
    return this.ctx.storage.sql.exec<{ id: number }>('SELECT MAX(id) AS id FROM actions').one().id;
  }

  list(workspace: string): Action[] {
    return this.ctx.storage.sql
      .exec<{ id: number; workspace: string; recipient: string; subject: string; status: string }>(
        'SELECT id, workspace, recipient, subject, status FROM actions WHERE workspace = ? ORDER BY id',
        workspace,
      )
      .toArray()
      .map((row) => ({
        id: row.id,
        workspace: row.workspace,
        to: row.recipient,
        subject: row.subject,
        status: row.status === 'delivered' ? 'delivered' : row.status === 'rejected' ? 'rejected' : 'pending',
      }));
  }

  decide(workspace: string, id: number, approve: boolean) {
    this.ctx.storage.sql.exec(
      "UPDATE actions SET status = ? WHERE workspace = ? AND id = ? AND status = 'pending'",
      approve ? 'delivered' : 'rejected',
      workspace,
      id,
    );
    return this.list(workspace).find((action) => action.id === id);
  }
}

const ledger = (env: GateEnv) => env.LEDGER.get(env.LEDGER.idFromName('ledger'));

export class Outbox extends WorkerEntrypoint<GateEnv> {
  async send(workspace: string, to: string, subject: string) {
    if (!ADDRESS.test(to)) return { refused: `not an email address: ${to}` };
    if (subject.length === 0 || subject.length > 200)
      return { refused: 'subject must be 1 to 200 characters' };
    const id = await ledger(this.env).queue(workspace, to, subject);
    return { id, status: 'sent', note: 'simulated until a person approves it' };
  }

  async sent(workspace: string) {
    return (await ledger(this.env).list(workspace)).map((action) => ({
      id: action.id,
      to: action.to,
      subject: action.subject,
      status: action.status === 'rejected' ? 'rejected' : 'sent',
    }));
  }
}

export class Review extends WorkerEntrypoint<GateEnv> {
  async actions(workspace: string) {
    return ledger(this.env).list(workspace);
  }

  async decide(workspace: string, id: number, approve: boolean) {
    return ledger(this.env).decide(workspace, id, approve);
  }

  async holdsKey() {
    return typeof this.env.DELIVERY_KEY === 'string' && this.env.DELIVERY_KEY !== '';
  }
}

export default {
  async fetch() {
    return new Response('not found', { status: 404 });
  },
} satisfies ExportedHandler<GateEnv>;
