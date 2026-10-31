import { container, durableObject, shapeStack, workersAi } from '../kit/stack.ts';
import type { Box, Seat } from './src/index.ts';

export default shapeStack(
  'shared-container',
  {
    SEAT: durableObject<Seat>('Seat'),
    BOX: container<Box>('shared-container', 'Box', { dockerfile: 'shared.Dockerfile' }),
    AI: workersAi('AI'),
  },
  { gateway: { binding: 'GATEWAY' } },
);
