import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import {
  COMPATIBILITY_DATE,
  durableObject,
  gatewayName,
  shapeHost,
  workerName,
  workersAi,
} from '../kit/stack.ts';
import type { Session } from './src/index.ts';

const SLUG = 'vector-memory';

export default Alchemy.Stack(
  workerName(SLUG),
  { providers: Cloudflare.providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    const memory = yield* Cloudflare.Vectorize.Index('memory', {
      name: workerName(SLUG),
      dimensions: 768,
      metric: 'cosine',
    });
    const gateway = yield* Cloudflare.AI.Gateway('gateway', { id: gatewayName(SLUG), authentication: true });
    const worker = yield* Cloudflare.Worker('worker', {
      name: workerName(SLUG),
      main: './src/index.ts',
      compatibility: { date: COMPATIBILITY_DATE, flags: ['nodejs_compat'] },
      workersDev: false,
      domain: shapeHost(SLUG),
      env: {
        SESSION: durableObject<Session>('Session'),
        MEMORY: memory,
        AI: workersAi('AI'),
        GATEWAY: gateway.gatewayId,
      },
    });
    return { url: worker.url, worker: worker.workerName };
  }),
);
