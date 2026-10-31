import { container, shapeStack, workersAi } from '../kit/stack.ts';
import type { Thread } from './src/index.ts';

export default shapeStack(
  'container-per-thread',
  { THREAD: container<Thread>('container-per-thread', 'Thread'), AI: workersAi('AI') },
  { gateway: { binding: 'GATEWAY' } },
);
