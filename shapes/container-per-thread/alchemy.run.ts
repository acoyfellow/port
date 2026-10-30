import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import type { Thread } from './src/index.ts';

export default Alchemy.Stack(
  'port-shape-container-per-thread',
  { providers: Cloudflare.providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    const worker = yield* Cloudflare.Worker('worker', {
      name: 'port-shape-container-per-thread',
      main: './src/index.ts',
      compatibility: { date: '2026-09-30' },
      workersDev: true,
      env: {
        THREAD: Cloudflare.Container<Thread>('Thread', {
          name: 'port-shape-container-per-thread-computer',
          className: 'Thread',
          context: './box',
          maxInstances: 1,
          instanceType: 'lite',
        }),
      },
    });
    return { url: worker.url, worker: worker.workerName };
  }),
);
