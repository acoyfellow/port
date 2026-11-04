import { WorkerEntrypoint } from 'cloudflare:workers';
import { Type } from '@earendil-works/pi-ai';
import { defineExtension, defineTool } from '@earendil-works/pi-durable';
import { type AgentEnv, piAgent } from '../../kit/agent.ts';
import { type FileStore, MemoryExecutionEnv, sqliteFileStore } from '../../kit/memory-env.ts';
import { piRouter } from '../../kit/router.ts';
import type { Action, Outbox, Review } from '../gate/index.ts';

type Env = AgentEnv & {
  readonly WORKSPACE: DurableObjectNamespace<Workspace>;
  readonly LOADER: WorkerLoader;
  readonly OUTBOX: Service<Outbox>;
  readonly REVIEW: Service<Review>;
};

type ScopedProps = { readonly workspace: string };

const ROOT = '/workspace';
const SERVER = `${ROOT}/gadget/server.js`;
const GADGET = 'gadget';
const COMPATIBILITY_DATE = '2026-09-30';
const decoder = new TextDecoder();

const STARTER = `import { DurableObject } from "cloudflare:workers";

export class Gadget extends DurableObject {
  async fetch(request) {
    return Response.json({ ok: true, path: new URL(request.url).pathname });
  }
}
`;

export class GadgetOutbox extends WorkerEntrypoint<Env, ScopedProps> {
  async send(to: string, subject: string) {
    return this.env.OUTBOX.send(this.ctx.props.workspace, String(to), String(subject));
  }

  async sent() {
    return this.env.OUTBOX.sent(this.ctx.props.workspace);
  }
}

type LoopbackFactory = (options: { props: ScopedProps }) => Fetcher;

const isLoopbackFactory = (value: unknown): value is LoopbackFactory => typeof value === 'function';

const scopedOutbox = (ctx: DurableObjectState, workspace: string) => {
  const factory = Reflect.get(ctx.exports, 'GadgetOutbox');
  if (!isLoopbackFactory(factory)) throw new Error('GadgetOutbox loopback export is missing');
  return factory({ props: { workspace } });
};

const files = (ctx: DurableObjectState): FileStore => {
  const store = sqliteFileStore(ctx.storage.sql, 'workspace');
  if (store.load()[SERVER] === undefined) store.save(SERVER, new TextEncoder().encode(STARTER));
  return store;
};

const fingerprint = async (source: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source)))]
    .slice(0, 8)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const sandbox = (env: Env, ctx: DurableObjectState, id: string, source: string) =>
  env.LOADER.get(id, () => ({
    compatibilityDate: COMPATIBILITY_DATE,
    compatibilityFlags: [],
    mainModule: 'server.js',
    modules: { 'server.js': source },
    globalOutbound: null,
    env: { OUTBOX: scopedOutbox(ctx, ctx.id.toString()) },
  }));

const gadget = async (env: Env, ctx: DurableObjectState) => {
  const source = decoder.decode(files(ctx).load()[SERVER] ?? new Uint8Array());
  const worker = sandbox(env, ctx, `${ctx.id.toString()}:${await fingerprint(source)}`, source);
  return ctx.facets.get(GADGET, () => ({ class: worker.getDurableObjectClass('Gadget') }));
};

const CANARY = `import { DurableObject } from "cloudflare:workers";
export class Gadget extends DurableObject {
  async fetch() {
    const internet = await fetch("https://example.com").then((r) => "reached " + r.status, (e) => "blocked: " + e.message);
    return Response.json({ internet, bindings: Object.keys(this.env).sort().join(",") });
  }
}
`;

const canary = async (env: Env, ctx: DurableObjectState) => {
  const worker = sandbox(env, ctx, `${ctx.id.toString()}:canary`, CANARY);
  const facet = ctx.facets.get('canary', () => ({ class: worker.getDurableObjectClass('Gadget') }));
  const answer: unknown = await (await facet.fetch('https://gadget/')).json();
  ctx.facets.delete('canary');
  return {
    internet: String(Reflect.get(Object(answer), 'internet')),
    bindings: String(Reflect.get(Object(answer), 'bindings')),
  };
};

const callGadget = async (env: Env, ctx: DurableObjectState, method: string, path: string, body: string) => {
  const facet = await gadget(env, ctx);
  const response = await facet.fetch(`https://gadget${path.startsWith('/') ? path : `/${path}`}`, {
    method,
    headers: body === '' ? {} : { 'content-type': 'application/json' },
    body: body === '' || method === 'GET' ? undefined : body,
  });
  return `HTTP ${response.status}\n${(await response.text()).slice(0, 4000)}`;
};

const gadgetTools = (env: Env, ctx: DurableObjectState) =>
  defineExtension({
    name: 'gadget',
    tools: [
      defineTool({
        name: 'call_gadget',
        description:
          'Send an HTTP request to your gadget. The gadget runs the current /workspace/gadget/server.js as a Durable Object facet of this workspace, with its own private storage. Edit server.js first; the next call loads the new code and keeps the storage.',
        parameters: Type.Object({
          method: Type.String({ description: 'GET or POST' }),
          path: Type.String({ description: 'path such as /list' }),
          body: Type.Optional(Type.String({ description: 'JSON request body for POST' })),
        }),
        execute: async (input) => {
          try {
            return {
              output: [
                {
                  type: 'text',
                  text: await callGadget(env, ctx, input.method.toUpperCase(), input.path, input.body ?? ''),
                },
              ],
            };
          } catch (error) {
            return { output: [{ type: 'text', text: `gadget failed: ${String(error)}` }] };
          }
        },
      }),
    ],
  });

const INSTRUCTIONS = `You build gadgets: small private apps for one person, each in its own sandbox.
The gadget is /workspace/gadget/server.js, an ES module that exports a class named Gadget extending DurableObject from "cloudflare:workers". Its fetch(request) method answers HTTP requests. It has private storage through this.ctx.storage.sql (SQLite) or this.ctx.storage.kv.
The gadget cannot reach the internet. Its only outside connection is this.env.OUTBOX, a gatekeeper:
- await this.env.OUTBOX.send(to, subject) sends an email and returns {id, status}.
- await this.env.OUTBOX.sent() lists what was sent.
Edit server.js with the file tools, then test it with call_gadget. Reply in one short sentence.`;

const count = (actions: readonly Action[], status: Action['status']) =>
  actions.filter((action) => action.status === status).length;

export class Workspace extends piAgent<Env>({
  name: 'gadget-workspace',
  instructions: INSTRUCTIONS,
  environment: (_env, ctx) =>
    new MemoryExecutionEnv({ id: `gadget-workspace:${ctx.id.toString()}`, cwd: ROOT, store: files(ctx) }),
  extensions: (env, ctx) => [gadgetTools(env, ctx)],
  probe: async (env, ctx) => {
    const actions = await env.REVIEW.actions(ctx.id.toString());
    const list = await callGadget(env, ctx, 'GET', '/list', '').catch(
      (error: unknown) => `failed ${String(error)}`,
    );
    const sandboxCheck = await canary(env, ctx).catch((error: unknown) => ({
      internet: `canary failed: ${String(error)}`,
      bindings: '',
    }));
    return {
      facts: {
        list: list.slice(0, 400),
        pending: count(actions, 'pending'),
        delivered: count(actions, 'delivered'),
        recipients: actions.map((action) => action.to).join(','),
        gateHoldsKey: await env.REVIEW.holdsKey(),
        workspaceHasKey: Reflect.has(env, 'DELIVERY_KEY'),
        sandboxInternet: sandboxCheck.internet.slice(0, 160),
        sandboxBindings: sandboxCheck.bindings,
      },
    };
  },
}) {}

export default piRouter<Env>({
  shape: 'gadget-workspace',
  agent: (env, name) => env.WORKSPACE.get(env.WORKSPACE.idFromName(name)),
  gateway: (env) => env.GATEWAY,
});
