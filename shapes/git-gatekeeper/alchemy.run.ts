import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import {
  COMPATIBILITY_DATE,
  container,
  gatewayName,
  shapeHost,
  workerName,
  workersAi,
} from '../kit/stack.ts';
import type { Session } from './src/index.ts';

const SLUG = 'git-gatekeeper';

export default Alchemy.Stack(
  workerName(SLUG),
  { providers: Cloudflare.providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    const repos = yield* Cloudflare.Artifacts.Namespace('REPOS', { namespace: workerName(SLUG) });
    const gate = yield* Cloudflare.Worker('gate', {
      name: `${workerName(SLUG)}-gate`,
      main: './gate/index.ts',
      compatibility: { date: COMPATIBILITY_DATE, flags: ['nodejs_compat'] },
      workersDev: false,
      env: { REPOS: repos },
    });
    const gateway = yield* Cloudflare.AI.Gateway('gateway', { id: gatewayName(SLUG), authentication: true });
    const worker = yield* Cloudflare.Worker('worker', {
      name: workerName(SLUG),
      main: './src/index.ts',
      compatibility: { date: COMPATIBILITY_DATE, flags: ['nodejs_compat'] },
      workersDev: false,
      domain: shapeHost(SLUG),
      env: {
        SESSION: container<Session>(SLUG, 'Session'),
        GATE: Cloudflare.WorkerEntrypoint(gate, 'Gatekeeper'),
        AI: workersAi('AI'),
        GATEWAY: gateway.gatewayId,
      },
    });
    return { url: worker.url, worker: worker.workerName, gate: gate.workerName };
  }),
);
