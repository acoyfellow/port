import { FLEET_CREATES } from './fleet-manifest';

export const FLEET = {
  slug: 'fleet',
  mark: 'F',
  name: 'Agent fleet',
  oneLine:
    'Coding agents on your own account. Each agent runs its loop in a Durable Object and runs tests in a fresh isolate. No container.',
  creates: FLEET_CREATES,
  scopes: ['workers-scripts.admin', 'ai.read', 'aig.write', 'aig.run'],
  evidence: [
    'Ran on a real account: 4 of 5 swarm-5 tasks passed hidden tests on Kimi K2.7 Code, $0.088 in total',
    'Tear down deleted the Worker and the AI Gateway, then checked both are gone',
  ],
} as const;

export const DIRECTORY_SLOTS = 5;
