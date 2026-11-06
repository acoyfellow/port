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
import type { Tape } from './recorder/index.ts';
import type { Session } from './src/index.ts';

const SLUG = 'flight-recorder';

export default Alchemy.Stack(
  workerName(SLUG),
  { providers: Cloudflare.providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    const recorder = yield* Cloudflare.Worker('recorder', {
      name: `${workerName(SLUG)}-recorder`,
      main: './recorder/index.ts',
      compatibility: { date: COMPATIBILITY_DATE, flags: ['nodejs_compat'] },
      workersDev: false,
      env: { TAPE: durableObject<Tape>('Tape') },
    });
    const gateway = yield* Cloudflare.AI.Gateway('gateway', { id: gatewayName(SLUG), authentication: true });
    const worker = yield* Cloudflare.Worker('worker', {
      name: workerName(SLUG),
      main: './src/index.ts',
      compatibility: { date: COMPATIBILITY_DATE, flags: ['nodejs_compat'] },
      workersDev: false,
      domain: shapeHost(SLUG),
      tailConsumers: [recorder],
      env: {
        SESSION: durableObject<Session>('Session'),
        READER: Cloudflare.WorkerEntrypoint(recorder, 'Reader'),
        AI: workersAi('AI'),
        GATEWAY: gateway.gatewayId,
      },
    });
    return { url: worker.url, worker: worker.workerName, recorder: recorder.workerName };
  }),
);
