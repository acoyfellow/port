import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import * as Redacted from 'effect/Redacted';
import {
  COMPATIBILITY_DATE,
  durableObject,
  gatewayName,
  shapeHost,
  workerLoader,
  workerName,
  workersAi,
} from '../kit/stack.ts';
import type { Ledger } from './gate/index.ts';
import type { Workspace } from './src/index.ts';

const SLUG = 'gadget-workspace';

export default Alchemy.Stack(
  workerName(SLUG),
  { providers: Cloudflare.providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    const gate = yield* Cloudflare.Worker('gate', {
      name: `${workerName(SLUG)}-gate`,
      main: './gate/index.ts',
      compatibility: { date: COMPATIBILITY_DATE, flags: ['nodejs_compat'] },
      workersDev: false,
      env: { LEDGER: durableObject<Ledger>('Ledger'), DELIVERY_KEY: Redacted.make(crypto.randomUUID()) },
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
        LOADER: workerLoader('LOADER'),
        OUTBOX: Cloudflare.WorkerEntrypoint(gate, 'Outbox'),
        REVIEW: Cloudflare.WorkerEntrypoint(gate, 'Review'),
        AI: workersAi('AI'),
        GATEWAY: gateway.gatewayId,
      },
    });
    return { url: worker.url, worker: worker.workerName, gate: gate.workerName };
  }),
);
