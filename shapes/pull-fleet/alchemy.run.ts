import { container, durableObject, shapeStack, workersAi } from '../kit/stack.ts';
import type { Coordinator, Seat, Vessel } from './src/index.ts';

export default shapeStack(
  'pull-fleet',
  {
    COORDINATOR: durableObject<Coordinator>('Coordinator'),
    SEAT: durableObject<Seat>('Seat'),
    VESSEL: container<Vessel>('pull-fleet', 'Vessel', { instanceType: 'basic', maxInstances: 3 }),
    AI: workersAi('AI'),
  },
  { gateway: { binding: 'GATEWAY' } },
);
