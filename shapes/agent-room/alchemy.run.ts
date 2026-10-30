import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import type { AgentDO, ChatRoomDO } from './src/index.ts';

export default Alchemy.Stack(
  'port-shape-agent-room',
  { providers: Cloudflare.providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    const worker = yield* Cloudflare.Worker('worker', {
      name: 'port-shape-agent-room',
      main: './src/index.ts',
      compatibility: { date: '2026-09-30' },
      workersDev: true,
      env: {
        ROOM: Cloudflare.DurableObject<ChatRoomDO>('ChatRoomDO'),
        AGENT: Cloudflare.DurableObject<AgentDO>('AgentDO'),
      },
    });
    return { url: worker.url, worker: worker.workerName };
  }),
);
