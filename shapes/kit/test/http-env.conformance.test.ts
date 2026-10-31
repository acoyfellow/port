import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEnvConformance, createExpectAssertions } from '@earendil-works/pi-durable/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RemoteHttpEnv } from '../http-env.ts';

const PORT = 18_000 + Math.floor(Math.random() * 1000);
let server: ChildProcess | undefined;

beforeAll(async () => {
  server = spawn(process.execPath, [join(import.meta.dirname, '..', 'box', 'env-server.mjs')], {
    env: {
      ...process.env,
      PI_ENV_PORT: String(PORT),
      PI_ENV_ROOT: mkdtempSync(join(tmpdir(), 'pi-env-root-')),
    },
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    const up = await fetch(`http://127.0.0.1:${PORT}/`)
      .then((response) => response.ok)
      .catch(() => false);
    if (up) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('env server did not start');
});

afterAll(() => {
  server?.kill();
});

const cases = createEnvConformance({
  assertions: createExpectAssertions(expect),
  withEnv: async (use) => {
    const cwd = mkdtempSync(join(tmpdir(), 'pi-env-case-'));
    try {
      await use(
        new RemoteHttpEnv({
          id: `http:${cwd}`,
          cwd,
          transport: (path, init) => fetch(`http://127.0.0.1:${PORT}${path}`, init),
        }),
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  },
});

describe('pi-durable env conformance: RemoteHttpEnv against the container env server', () => {
  for (const each of cases) {
    if (each.name.startsWith('watch ')) continue;
    it(each.name, () => each.run(), each.timeoutMs ?? 15_000);
  }
});
