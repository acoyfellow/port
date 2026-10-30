import { container, shapeStack } from '../kit/stack.ts';
import type { Box } from './src/index.ts';

export default shapeStack('sealed-box', {
  BOX: container<Box>('sealed-box', 'Box'),
});
