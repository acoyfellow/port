export type ModelLimits = {
  readonly calls: number;
  readonly requestBytes: number;
  readonly outputTokens: number;
  readonly lifetimeMs: number;
};

export const boundedModelFetch =
  (
    fetch: typeof globalThis.fetch,
    storage: DurableObjectStorage,
    limits: ModelLimits,
  ): typeof globalThis.fetch =>
  async (input, init) => {
    if (
      ![limits.calls, limits.requestBytes, limits.outputTokens, limits.lifetimeMs].every(
        (value) => Number.isSafeInteger(value) && value > 0,
      )
    )
      throw new Error('Invalid model limits');
    const request = new Request(input, init);
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > limits.requestBytes) throw new Error('Model input limit');
    const body: unknown = JSON.parse(text);
    if (body === null || typeof body !== 'object' || Array.isArray(body))
      throw new Error('Invalid model request');
    const current = await storage.transaction(async (transaction) => {
      const prior = await transaction.get<{ calls: number; deadline: number }>('search-model-budget');
      const budget = prior ?? { calls: 0, deadline: Date.now() + limits.lifetimeMs };
      if (budget.calls >= limits.calls || Date.now() >= budget.deadline)
        throw new Error('Model budget exhausted');
      await transaction.put('search-model-budget', { ...budget, calls: budget.calls + 1 });
      return budget;
    });
    const headers = new Headers(request.headers);
    headers.delete('content-length');
    const response = await fetch(
      new Request(request.url, {
        method: request.method,
        headers,
        body: JSON.stringify({
          ...body,
          max_tokens: limits.outputTokens,
          max_completion_tokens: limits.outputTokens,
          n: 1,
        }),
        signal: AbortSignal.any([
          request.signal,
          AbortSignal.timeout(Math.max(1, current.deadline - Date.now())),
        ]),
      }),
    );
    await storage.transaction(async (transaction) => {
      await transaction.put('search-model-last-response', {
        status: response.status,
        requestBytes: new TextEncoder().encode(text).byteLength,
        outputTokenCap: limits.outputTokens,
        calls: current.calls + 1,
        at: Date.now(),
      });
    });
    if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream'))
      return response;
    const decoder = new TextDecoder();
    let pending = '';
    const finishReasons: string[] = [];
    let toolCallChunks = 0;
    const observe = (line: string) => {
      if (!line.startsWith('data:') || line.slice(5).trim() === '[DONE]') return;
      try {
        const data: unknown = JSON.parse(line.slice(5));
        const choices = Reflect.get(Object(data), 'choices');
        if (!Array.isArray(choices)) return;
        for (const choice of choices) {
          const reason = Reflect.get(Object(choice), 'finish_reason');
          if (typeof reason === 'string' && finishReasons.length < 16) finishReasons.push(reason);
          const delta = Reflect.get(Object(choice), 'delta');
          const calls = Reflect.get(Object(delta), 'tool_calls');
          if (Array.isArray(calls)) toolCallChunks += calls.length;
        }
      } catch {}
    };
    const stream = response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          controller.enqueue(chunk);
          pending += decoder.decode(chunk, { stream: true });
          const lines = pending.split('\n');
          pending = lines.pop() ?? '';
          for (const line of lines) observe(line);
          if (pending.length > 262144) pending = '';
        },
        async flush() {
          pending += decoder.decode();
          if (pending) observe(pending);
          await storage.transaction(async (transaction) => {
            await transaction.put('search-model-last-stream', {
              calls: current.calls + 1,
              finishReasons,
              toolCallChunks,
            });
          });
        },
      }),
    );
    return new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
