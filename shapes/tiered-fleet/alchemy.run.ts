import { container, durableObject, shapeStack, workerLoader, workersAi } from '../kit/stack.ts';
import type { Agent, Tracker, Vessel } from './src/index.ts';

export default shapeStack(
  'tiered-fleet',
  {
    AGENT: durableObject<Agent>('Agent'),
    TRACKER: durableObject<Tracker>('Tracker'),
    VESSEL: container<Vessel>('tiered-fleet', 'Vessel', { instanceType: 'basic', maxInstances: 2 }),
    LOADER: workerLoader('LOADER'),
    AI: workersAi('AI'),
  },
  { gateway: { binding: 'GATEWAY' } },
);
