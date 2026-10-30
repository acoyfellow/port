import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import type { Directory, Hark } from './src/index.ts';

export default Alchemy.Stack(
  'port-shape-person-with-computer',
  { providers: Cloudflare.providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    const worker = yield* Cloudflare.Worker('worker', {
      name: 'port-shape-person-with-computer',
      main: './src/index.ts',
      compatibility: { date: '2026-09-30' },
      workersDev: true,
      env: {
        DIRECTORY: Cloudflare.DurableObject<Directory>('Directory'),
        HARK: Cloudflare.Container<Hark>('Hark', {
          name: 'port-shape-person-with-computer-computer',
          className: 'Hark',
          context: './computer',
          maxInstances: 1,
          instanceType: 'lite',
        }),
      },
    });
    return { url: worker.url, worker: worker.workerName };
  }),
);
