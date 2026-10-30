import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import type { Box } from './src/index.ts';

export default Alchemy.Stack(
  'port-shape-sealed-box',
  { providers: Cloudflare.providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    const worker = yield* Cloudflare.Worker('worker', {
      name: 'port-shape-sealed-box',
      main: './src/index.ts',
      compatibility: { date: '2026-09-30' },
      workersDev: true,
      env: {
        BOX: Cloudflare.Container<Box>('Box', {
          name: 'port-shape-sealed-box-box',
          className: 'Box',
          context: './box',
          maxInstances: 1,
          instanceType: 'lite',
        }),
      },
    });
    return { url: worker.url, worker: worker.workerName };
  }),
);
