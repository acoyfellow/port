import { container, durableObject, shapeStack, workersAi } from '../kit/stack.ts';
import type { Fleet, Seat } from './src/index.ts';

export default shapeStack(
  'beam-fleet',
  {
    SEAT: durableObject<Seat>('Seat'),
    BOX: container<Fleet>('beam-fleet', 'Fleet', { dockerfile: 'beam.Dockerfile' }),
    AI: workersAi('AI'),
  },
  { gateway: { binding: 'GATEWAY' } },
);
