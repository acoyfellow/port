import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import { type ApproverKey, type Assertion, actionDigest, verifyAssertion } from './passkey.ts';

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

  async enroll(workspace: string, key: ApproverKey) {
    if (await this.ctx.storage.get<ApproverKey>(`approver:${workspace}`))
      return { refused: 'an approver is already enrolled for this workspace' };
    await this.ctx.storage.put(`approver:${workspace}`, key);
    return { enrolled: true };
  }

  async challenge(workspace: string, id: number) {
    const action = this.list(workspace).find((each) => each.id === id);
    return action === undefined ? undefined : actionDigest(action);
  }

  async approve(
    workspace: string,
    id: number,
    assertion: Assertion | undefined,
    origin: string,
    rpId: string,
  ) {
    const action = this.list(workspace).find((each) => each.id === id);
    if (action === undefined) return { refused: 'no such action' };
    if (action.status !== 'pending') return { refused: `action is already ${action.status}` };
    if (assertion === undefined) return { refused: 'approval needs a passkey signature' };
    const key = await this.ctx.storage.get<ApproverKey>(`approver:${workspace}`);
    if (key === undefined) return { refused: 'no approver is enrolled' };
    const problem = await verifyAssertion(key, assertion, {
      challenge: await actionDigest(action),
      origin,
      rpId,
    });
    if (problem !== '') return { refused: problem };
    this.#setStatus(workspace, id, 'delivered');
    return { delivered: id };
  }

  reject(workspace: string, id: number) {
    this.#setStatus(workspace, id, 'rejected');
    return this.list(workspace).find((action) => action.id === id);
  }

  #setStatus(workspace: string, id: number, status: 'delivered' | 'rejected') {
    this.ctx.storage.sql.exec(
      "UPDATE actions SET status = ? WHERE workspace = ? AND id = ? AND status = 'pending'",
      status,
      workspace,
      id,
    );
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

  async enroll(workspace: string, key: ApproverKey) {
    return ledger(this.env).enroll(workspace, key);
  }

  async challenge(workspace: string, id: number) {
    return ledger(this.env).challenge(workspace, id);
  }

  async approve(
    workspace: string,
    id: number,
    assertion: Assertion | undefined,
    origin: string,
    rpId: string,
  ) {
    return ledger(this.env).approve(workspace, id, assertion, origin, rpId);
  }

  async reject(workspace: string, id: number) {
    return ledger(this.env).reject(workspace, id);
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
