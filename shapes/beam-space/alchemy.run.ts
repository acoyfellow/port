import type { Fleet } from '../kit/beam.ts';
import { container, durableObject, shapeStack, workersAi } from '../kit/stack.ts';
import type { Space, Thread } from './src/index.ts';

export default shapeStack(
  'beam-space',
  {
    SPACE: durableObject<Space>('Space'),
    THREAD: durableObject<Thread>('Thread'),
    BOX: container<Fleet>('beam-space', 'Fleet', { dockerfile: 'beam.Dockerfile' }),
    AI: workersAi('AI'),
  },
  { gateway: { binding: 'GATEWAY' } },
);
