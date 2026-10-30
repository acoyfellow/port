export type ToolUse = { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };

export type Block =
  | { type: 'text'; text: string }
  | ToolUse
  | {
      type: 'tool_result';
      tool_use_id: string;
      content: string;
      is_error?: boolean;
      cache_control?: unknown;
    };

export type Message = { role: 'user' | 'assistant'; content: string | Block[] };

export type Tool = { name: string; description: string; input_schema: Record<string, unknown> };

export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number };

export type ModelReply = { content: Block[]; usage: Usage };

export type Price = { input: number; output: number; cacheRead: number; cacheWrite: number };

export type ModelEnv = {
  readonly AI: {
    fetch(input: string, init?: RequestInit): Promise<Response>;
    run(
      model: string,
      input: Record<string, unknown>,
      options: { gateway: { id: string } },
    ): Promise<unknown>;
  };
  readonly GATEWAY: string;
};

export const PRICES: Record<string, Price> = {
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  '@cf/moonshotai/kimi-k2.7-code': { input: 0.95, output: 4, cacheRead: 0.19, cacheWrite: 0 },
  '@cf/moonshotai/kimi-k2.6': { input: 0.95, output: 4, cacheRead: 0.16, cacheWrite: 0 },
  '@cf/zai-org/glm-5.3': { input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 0 },
  '@cf/zai-org/glm-5.3-flash': { input: 0.15, output: 0.5, cacheRead: 0.03, cacheWrite: 0 },
  '@cf/deepseek-ai/deepseek-v4-flash-0731': { input: 0.44, output: 1.32, cacheRead: 0.014, cacheWrite: 0 },
  '@cf/openai/gpt-oss-120b': { input: 0.35, output: 0.75, cacheRead: 0, cacheWrite: 0 },
};

export const costOf = (model: string, usage: Usage) => {
  const price = PRICES[model] ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  return (
    (usage.input * price.input +
      usage.output * price.output +
      usage.cacheRead * price.cacheRead +
      usage.cacheWrite * price.cacheWrite) /
    1_000_000
  );
};

const GATEWAY_BINDING_AUTH = ['Bearer', 'cloudflare-gateway-binding'].join(' ');

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;

const num = (value: unknown) => (typeof value === 'number' ? value : 0);

const str = (value: unknown) => (typeof value === 'string' ? value : '');

const anthropic = async (
  env: ModelEnv,
  model: string,
  system: string,
  tools: Tool[],
  messages: Message[],
) => {
  const response = await env.AI.fetch(
    `https://workers-binding.ai/ai-gateway/gateways/${env.GATEWAY}/anthropic/v1/messages`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'cf-aig-authorization': GATEWAY_BINDING_AUTH,
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        tools,
        messages,
      }),
    },
  );
  if (!response.ok) throw new Error(`model ${response.status}: ${(await response.text()).slice(0, 400)}`);
  const body: unknown = await response.json();
  const usage = field(body, 'usage');
  const content = field(body, 'content');

  return {
    content: Array.isArray(content) ? content : [],
    usage: {
      input: num(field(usage, 'input_tokens')),
      output: num(field(usage, 'output_tokens')),
      cacheRead: num(field(usage, 'cache_read_input_tokens')),
      cacheWrite: num(field(usage, 'cache_creation_input_tokens')),
    },
  };
};

type OpenAIMessage =
  | { role: 'system' | 'user'; content: string }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
    }
  | { role: 'tool'; tool_call_id: string; content: string };

const toOpenAI = (system: string, messages: Message[]): OpenAIMessage[] => {
  const out: OpenAIMessage[] = [{ role: 'system', content: system }];
  for (const message of messages) {
    if (typeof message.content === 'string') {
      out.push({ role: message.role, content: message.content });
      continue;
    }
    if (message.role === 'assistant') {
      const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n');
      const calls = message.content.flatMap((b) =>
        b.type === 'tool_use'
          ? [
              {
                id: b.id,
                type: 'function' as const,
                function: { name: b.name, arguments: JSON.stringify(b.input) },
              },
            ]
          : [],
      );
      out.push({
        role: 'assistant',
        content: text === '' ? null : text,
        ...(calls.length > 0 ? { tool_calls: calls } : {}),
      });
      continue;
    }
    for (const block of message.content) {
      if (block.type === 'tool_result')
        out.push({ role: 'tool', tool_call_id: block.tool_use_id, content: block.content });
      else if (block.type === 'text') out.push({ role: 'user', content: block.text });
    }
  }
  return out;
};

const parseArguments = (raw: unknown): Record<string, unknown> => {
  if (typeof raw === 'object' && raw !== null) return Object.fromEntries(Object.entries(raw));
  try {
    const parsed: unknown = JSON.parse(str(raw) || '{}');
    return typeof parsed === 'object' && parsed !== null ? Object.fromEntries(Object.entries(parsed)) : {};
  } catch {
    return {};
  }
};

const workersAI = async (
  env: ModelEnv,
  model: string,
  system: string,
  tools: Tool[],
  messages: Message[],
) => {
  const body = await env.AI.run(
    model,
    {
      messages: toOpenAI(system, messages),
      tools: tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      })),
      max_tokens: 8192,
    },
    { gateway: { id: env.GATEWAY } },
  );
  const choice = field(field(body, 'choices'), '0');
  const message = field(choice, 'message');
  const calls = field(message, 'tool_calls');
  const usage = field(body, 'usage');
  const text = str(field(message, 'content'));
  const content: Block[] = [
    ...(text === '' ? [] : [{ type: 'text' as const, text }]),
    ...(Array.isArray(calls)
      ? calls.map((call, index) => ({
          type: 'tool_use' as const,
          id: str(field(call, 'id')) || `call_${index}_${crypto.randomUUID().slice(0, 8)}`,
          name: str(field(field(call, 'function'), 'name')),
          input: parseArguments(field(field(call, 'function'), 'arguments')),
        }))
      : []),
  ];
  const cached = num(field(field(usage, 'prompt_tokens_details'), 'cached_tokens'));

  return {
    content,
    usage: {
      input: num(field(usage, 'prompt_tokens')) - cached,
      output: num(field(usage, 'completion_tokens')),
      cacheRead: cached,
      cacheWrite: 0,
    },
  };
};

export const callModel = (
  env: ModelEnv,
  model: string,
  system: string,
  tools: Tool[],
  messages: Message[],
): Promise<ModelReply> =>
  model.startsWith('@cf/')
    ? workersAI(env, model, system, tools, messages)
    : anthropic(env, model, system, tools, messages);
