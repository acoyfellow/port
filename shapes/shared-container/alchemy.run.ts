import { container, shapeStack } from '../kit/stack.ts';
import type { Box } from './src/index.ts';

export default shapeStack('shared-container', {
  BOX: container<Box>('shared-container', 'Box'),
});
