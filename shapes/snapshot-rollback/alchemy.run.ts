import { container, shapeStack, workersAi } from '../kit/stack.ts';
import type { Thread } from './src/index.ts';

export default shapeStack(
  'snapshot-rollback',
  { THREAD: container<Thread>('snapshot-rollback', 'Thread'), AI: workersAi('AI') },
  { gateway: { binding: 'GATEWAY' } },
);
