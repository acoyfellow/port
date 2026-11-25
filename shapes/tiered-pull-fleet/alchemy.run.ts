import { container, durableObject, shapeStack, workerLoader, workersAi } from '../kit/stack.ts';
import type { Coordinator, Seat, Vessel } from './src/index.ts';

export default shapeStack(
  'tiered-pull-fleet',
  {
    COORDINATOR: durableObject<Coordinator>('Coordinator'),
    SEAT: durableObject<Seat>('Seat'),
    VESSEL: container<Vessel>('tiered-pull-fleet', 'Vessel', { instanceType: 'basic', maxInstances: 2 }),
    LOADER: workerLoader('LOADER'),
    AI: workersAi('AI'),
  },
  { gateway: { binding: 'GATEWAY' } },
);
