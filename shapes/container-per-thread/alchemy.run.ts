import { container, shapeStack } from '../kit/stack.ts';
import type { Thread } from './src/index.ts';

export default shapeStack('container-per-thread', {
  THREAD: container<Thread>('container-per-thread', 'Thread'),
});
