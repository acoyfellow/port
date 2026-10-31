import { createEnvConformance, createExpectAssertions } from '@earendil-works/pi-durable/testing';
import { describe, expect, it } from 'vitest';
import { type FileStore, MemoryExecutionEnv } from '../memory-env.ts';

const memoryStore = (): FileStore => {
  const files = new Map<string, Uint8Array>();
  return {
    load: () => Object.fromEntries(files),
    save: (path, bytes) => (bytes === undefined ? files.delete(path) : files.set(path, bytes)),
  };
};

const SKIPPED = /^watch /;

const cases = createEnvConformance({
  assertions: createExpectAssertions(expect),
  withEnv: async (use) => {
    const env = new MemoryExecutionEnv({
      id: `memory:${crypto.randomUUID()}`,
      cwd: '/work',
      store: memoryStore(),
    });
    await use(env);
  },
});

describe('pi-durable env conformance: MemoryExecutionEnv', () => {
  for (const each of cases) {
    if (SKIPPED.test(each.name)) continue;
    it(each.name, () => each.run(), each.timeoutMs ?? 15_000);
  }
});
