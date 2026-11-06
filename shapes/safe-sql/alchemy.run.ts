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
import type { Analyst } from './src/index.ts';

const SLUG = 'safe-sql';

export default Alchemy.Stack(
  workerName(SLUG),
  { providers: Cloudflare.providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    const db = yield* Cloudflare.D1.Database('shop', {
      name: workerName(SLUG),
      migrations: `${import.meta.dirname}/migrations`,
    });
    const query = yield* Cloudflare.Worker('query', {
      name: `${workerName(SLUG)}-query`,
      main: './query/index.ts',
      compatibility: { date: COMPATIBILITY_DATE, flags: ['nodejs_compat'] },
      workersDev: false,
      env: { DB: db },
    });
    const gateway = yield* Cloudflare.AI.Gateway('gateway', { id: gatewayName(SLUG), authentication: true });
    const worker = yield* Cloudflare.Worker('worker', {
      name: workerName(SLUG),
      main: './src/index.ts',
      compatibility: { date: COMPATIBILITY_DATE, flags: ['nodejs_compat'] },
      workersDev: false,
      domain: shapeHost(SLUG),
      env: {
        ANALYST: durableObject<Analyst>('Analyst'),
        SQL: Cloudflare.WorkerEntrypoint(query, 'ReadOnly'),
        AI: workersAi('AI'),
        GATEWAY: gateway.gatewayId,
      },
    });
    return { url: worker.url, worker: worker.workerName, query: query.workerName };
  }),
);
