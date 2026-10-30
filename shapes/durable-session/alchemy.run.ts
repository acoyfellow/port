import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import type { Session } from './src/index.ts';

export default Alchemy.Stack(
  'port-shape-durable-session',
  { providers: Cloudflare.providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    const worker = yield* Cloudflare.Worker('worker', {
      name: 'port-shape-durable-session',
      main: './src/index.ts',
      compatibility: { date: '2026-09-30' },
      workersDev: true,
      env: { SESSION: Cloudflare.DurableObject<Session>('Session') },
    });
    return { url: worker.url, worker: worker.workerName };
  }),
);
