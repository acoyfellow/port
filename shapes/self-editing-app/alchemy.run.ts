import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import type { Body } from './src/index.ts';

export default Alchemy.Stack(
  'port-shape-self-editing-app',
  { providers: Cloudflare.providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    const worker = yield* Cloudflare.Worker('worker', {
      name: 'port-shape-self-editing-app',
      main: './src/index.ts',
      compatibility: { date: '2026-09-30' },
      workersDev: true,
      env: {
        BODY: Cloudflare.DurableObject<Body>('Body'),
        LOADER: Cloudflare.WorkerLoader('LOADER'),
      },
    });
    return { url: worker.url, worker: worker.workerName };
  }),
);
