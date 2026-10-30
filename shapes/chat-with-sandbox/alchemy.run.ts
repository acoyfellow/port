import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import type { Chat } from './src/index.ts';

export default Alchemy.Stack(
  'port-shape-chat-with-sandbox',
  { providers: Cloudflare.providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    const worker = yield* Cloudflare.Worker('worker', {
      name: 'port-shape-chat-with-sandbox',
      main: './src/index.ts',
      compatibility: { date: '2026-09-30' },
      workersDev: true,
      env: {
        CHAT: Cloudflare.Container<Chat>('Chat', {
          name: 'port-shape-chat-with-sandbox-box',
          className: 'Chat',
          context: './box',
          maxInstances: 1,
          instanceType: 'lite',
        }),
      },
    });
    return { url: worker.url, worker: worker.workerName };
  }),
);
