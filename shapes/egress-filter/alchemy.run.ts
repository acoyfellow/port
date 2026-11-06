import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import {
  COMPATIBILITY_DATE,
  durableObject,
  gatewayName,
  shapeHost,
  workerLoader,
  workerName,
  workersAi,
} from '../kit/stack.ts';
import type { Log } from './filter/index.ts';
import type { Canary, Workspace } from './src/index.ts';

const SLUG = 'egress-filter';

export default Alchemy.Stack(
  workerName(SLUG),
  { providers: Cloudflare.providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    const filter = yield* Cloudflare.Worker('filter', {
      name: `${workerName(SLUG)}-filter`,
      main: './filter/index.ts',
      compatibility: { date: COMPATIBILITY_DATE, flags: ['nodejs_compat'] },
      workersDev: false,
      env: { LOG: durableObject<Log>('Log') },
    });
    const gateway = yield* Cloudflare.AI.Gateway('gateway', { id: gatewayName(SLUG), authentication: true });
    const worker = yield* Cloudflare.Worker('worker', {
      name: workerName(SLUG),
      main: './src/index.ts',
      compatibility: { date: COMPATIBILITY_DATE, flags: ['nodejs_compat'] },
      workersDev: false,
      domain: shapeHost(SLUG),
      env: {
        WORKSPACE: durableObject<Workspace>('Workspace'),
        CANARY: durableObject<Canary>('Canary'),
        LOADER: workerLoader('LOADER'),
        EGRESS: Cloudflare.WorkerEntrypoint(filter, 'Egress'),
        AUDIT: Cloudflare.WorkerEntrypoint(filter, 'Audit'),
        AI: workersAi('AI'),
        GATEWAY: gateway.gatewayId,
      },
    });
    return { url: worker.url, worker: worker.workerName, filter: filter.workerName };
  }),
);
