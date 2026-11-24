import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boundedModelFetch } from '../../shapes/kit/bounded-model.ts';

const storage = () => {
  const values = new Map();
  let queue = Promise.resolve();
  const transaction = {
    get: async (key) => values.get(key),
    put: async (key, value) => {
      values.set(key, value);
    },
  };
  return {
    transaction: (work) => {
      const result = queue.then(() => work(transaction));
      queue = result.catch(() => {});
      return result;
    },
  };
};
const limits = { calls: 1, requestBytes: 1024, outputTokens: 128, lifetimeMs: 1000 };
const request = () =>
  new Request('https://model.invalid', {
    method: 'POST',
    body: JSON.stringify({ max_tokens: 100000, n: 9 }),
  });

test('concurrent admissions cannot exceed persisted limit, including recreation', async () => {
  let calls = 0;
  const saved = storage();
  const backend = async (req) => {
    calls++;
    const body = await req.json();
    assert.equal(body.max_tokens, 128);
    assert.equal(body.max_completion_tokens, 128);
    assert.equal(body.n, 1);
    return new Response('{}');
  };
  const fetch = boundedModelFetch(backend, saved, limits);
  const results = await Promise.allSettled([fetch(request()), fetch(request())]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(calls, 1);
  await assert.rejects(boundedModelFetch(backend, saved, limits)(request()), /budget exhausted/);
});

test('stream diagnostics preserve bytes and record finish reasons', async () => {
  const saved = storage();
  const payload =
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0}]},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n';
  const fetch = boundedModelFetch(
    async () => new Response(payload, { headers: { 'content-type': 'text/event-stream' } }),
    saved,
    limits,
  );
  const response = await fetch(request());
  assert.equal(await response.text(), payload);
  const audit = await saved.transaction((transaction) => transaction.get('search-model-last-stream'));
  assert.deepEqual(audit.finishReasons, ['tool_calls']);
  assert.equal(audit.toolCallChunks, 1);
});

test('oversized input is refused before backend call', async () => {
  const fetch = boundedModelFetch(
    async () => {
      assert.fail('Backend reached');
    },
    storage(),
    { ...limits, requestBytes: 1 },
  );
  await assert.rejects(fetch(request()), /input limit/);
});

test('a failed provider call still consumes its reservation', async () => {
  const fetch = boundedModelFetch(
    async () => {
      throw new Error('Provider failed');
    },
    storage(),
    limits,
  );
  await assert.rejects(fetch(request()), /Provider failed/);
  await assert.rejects(fetch(request()), /budget exhausted/);
});
