import { DurableObject } from 'cloudflare:workers';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { Model, Provider, ProviderStreams } from '@earendil-works/pi-ai';
import {
  CLOUDFLARE_GATEWAY_BINDING_AUTH_SENTINEL,
  createAiBindingFetch,
} from '@earendil-works/pi-ai/api/cloudflare-ai-binding';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { createModels, createProvider } from '@earendil-works/pi-ai/models';
import { CLOUDFLARE_AI_GATEWAY_MODELS } from '@earendil-works/pi-ai/providers/cloudflare-ai-gateway.models';
import {
  type Conversation,
  createRegistry,
  defineExtension,
  type Extension,
  Harness,
  section,
  type Wake,
} from '@earendil-works/pi-durable';
import type { ExecutionEnv } from '@earendil-works/pi-durable/env';
import { openDurableObjectSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/cloudflare';
import { createCodingTools } from '@earendil-works/pi-durable/tools';

export const PI_PROVIDER = 'port-gateway';
export const DEFAULT_MODEL = 'workers-ai/@cf/moonshotai/kimi-k2.6';

const context = BACKGROUND_CONTEXT;
const HEARTBEAT_MS = 60_000;

export type AgentEnv = {
  readonly AI: Ai;
  readonly GATEWAY: string;
};

export type Answer = {
  readonly status: 'done' | 'unanswered';
  readonly reason?: string;
  readonly text: string;
  readonly usd: number;
  readonly tokens: number;
};

const gatewayModels = (gateway: string): Model<'openai-completions'>[] =>
  Object.values(CLOUDFLARE_AI_GATEWAY_MODELS)
    .filter((model) => model.api === 'openai-completions' && model.id.startsWith('workers-ai/'))
    .map((model) => ({
      ...model,
      api: 'openai-completions',
      provider: PI_PROVIDER,
      baseUrl: `https://workers-binding.ai/ai-gateway/gateways/${gateway}/compat`,
    }));

const BINDING_HEADERS = {
  'cf-aig-authorization': `Bearer ${CLOUDFLARE_GATEWAY_BINDING_AUTH_SENTINEL}`,
  Authorization: null,
  'x-api-key': null,
};

const throughBinding = (ai: Ai): ProviderStreams => {
  const inner = openAICompletionsApi();
  const fetch = createAiBindingFetch(ai);
  return {
    stream: (model, transcript, options) =>
      inner.stream(model, transcript, {
        ...options,
        fetch,
        headers: { ...options?.headers, ...BINDING_HEADERS },
      }),
    streamSimple: (model, transcript, options) =>
      inner.streamSimple(model, transcript, {
        ...options,
        fetch,
        headers: { ...options?.headers, ...BINDING_HEADERS },
      }),
  };
};

const gatewayProvider = (ai: Ai, gateway: string): Provider =>
  createProvider({
    id: PI_PROVIDER,
    name: 'AI Gateway through the Workers AI binding',
    auth: {
      apiKey: {
        name: 'Workers AI binding',
        resolve: async () => ({
          auth: { apiKey: CLOUDFLARE_GATEWAY_BINDING_AUTH_SENTINEL },
          source: 'AI binding',
        }),
      },
    },
    models: gatewayModels(gateway),
    api: { 'openai-completions': throughBinding(ai) },
  });

const lastText = (messages: readonly { role: string; content: unknown }[]) => {
  for (const message of [...messages].reverse()) {
    if (message.role !== 'assistant' || !Array.isArray(message.content)) continue;
    const text = message.content
      .flatMap((part: unknown) =>
        typeof part === 'object' && part !== null && Reflect.get(part, 'type') === 'text'
          ? [String(Reflect.get(part, 'text'))]
          : [],
      )
      .join('');
    if (text !== '') return text;
  }
  return '';
};

export type AgentShape<Env extends AgentEnv> = {
  readonly name: string;
  readonly instructions: string;
  readonly environment: (
    env: Env,
    ctx: DurableObjectState,
    conversationId: string,
  ) => ExecutionEnv | undefined;
  readonly extensions?: (env: Env) => readonly Extension[];
};

export const piAgent = <Env extends AgentEnv>(shape: AgentShape<Env>) =>
  class PiAgent extends DurableObject<Env> {
    #harness: Harness | undefined;
    #root: Conversation | undefined;

    constructor(ctx: DurableObjectState, env: Env) {
      super(ctx, env);
      void ctx.blockConcurrencyWhile(async () => {
        const fallback = Date.now() + HEARTBEAT_MS;
        const current = await ctx.storage.getAlarm();
        if (current === null || current > fallback) await ctx.storage.setAlarm(fallback);
        const models = createModels();
        models.setProvider(gatewayProvider(env.AI, env.GATEWAY));
        const registry = createRegistry();
        registry.install(createCodingTools());
        registry.install(
          defineExtension({
            name: shape.name,
            sections: [section('preamble', () => shape.instructions, { tag: false })],
          }),
        );
        for (const extension of shape.extensions?.(env) ?? []) registry.install(extension);
        this.#harness = await Harness.open(
          await openDurableObjectSqliteStorage(ctx.storage),
          {
            models,
            registry,
            env: ({ conversationId }) => shape.environment(env, ctx, String(conversationId)),
            onWake: (wake) => void this.#arm(wake).catch(() => ctx.abort('alarm write failed')),
          },
          context,
        );
        await this.#arm(this.#harness.wake());
        this.#harness.resume();
      });
    }

    async #arm(wake: Wake) {
      const heartbeat = wake.active ? Date.now() + HEARTBEAT_MS : undefined;
      const at =
        heartbeat === undefined || wake.at === undefined
          ? (heartbeat ?? wake.at)
          : Math.min(heartbeat, wake.at);
      if (at === undefined) await this.ctx.storage.deleteAlarm();
      else await this.ctx.storage.setAlarm(at);
    }

    override async alarm() {
      const harness = this.#opened();
      await this.#arm({ ...harness.wake(), active: true });
      harness.resume();
    }

    #opened() {
      if (this.#harness === undefined) throw new Error('the Pi harness is not open');
      return this.#harness;
    }

    async #conversation(model: string) {
      if (this.#root !== undefined) return this.#root;
      this.#root = await this.#opened().root(context, {
        agent: { model: { provider: PI_PROVIDER, modelId: model }, instructions: shape.instructions },
      });
      return this.#root;
    }

    async submit(input: string, requestId: string, model = DEFAULT_MODEL) {
      const harness = this.#opened();
      await this.#arm({ ...harness.wake(), active: true });
      const conversation = await this.#conversation(model);
      await conversation.submit({ type: 'input', content: input, requestId }, context);
      return requestId;
    }

    async status(
      requestId: string,
      input: string,
      model = DEFAULT_MODEL,
    ): Promise<Answer | { readonly status: 'running' }> {
      const conversation = await this.#conversation(model);
      const submission = await conversation.submit({ type: 'input', content: input, requestId }, context);
      const record = await submission.status(context);
      if (record.status !== 'done' && record.status !== 'unanswered') return { status: 'running' };
      return this.#answer(record.status, record.status === 'unanswered' ? record.reason : undefined);
    }

    async #answer(status: 'done' | 'unanswered', reason: string | undefined): Promise<Answer> {
      const harness = this.#opened();
      const conversation = await this.#conversation(DEFAULT_MODEL);
      const page = await conversation.entries({}, 50, undefined, context);
      const messages = [...page.items].reverse().flatMap((entry) => entry.model ?? []);
      const usage = await harness.usage(context);
      const totals = Object.values(usage.models);
      return {
        status,
        ...(reason === undefined ? {} : { reason }),
        text: lastText(messages),
        usd: totals.reduce((sum, each) => sum + each.cost.total, 0),
        tokens: totals.reduce((sum, each) => sum + each.totalTokens, 0),
      };
    }

    async restart() {
      this.ctx.abort('restart on purpose');
    }
  };
