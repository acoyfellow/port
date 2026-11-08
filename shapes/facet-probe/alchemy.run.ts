import { durableObject, shapeStack, workersAi } from '../kit/stack.ts';
import type { Host } from './src/index.ts';

export default shapeStack(
  'facet-probe',
  { HOST: durableObject<Host>('Host'), AI: workersAi('AI') },
  { gateway: { binding: 'GATEWAY' } },
);
