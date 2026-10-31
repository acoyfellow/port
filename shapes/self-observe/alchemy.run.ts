import { durableObject, shapeStack, workerLoader, workersAi } from '../kit/stack.ts';
import type { Observer } from './src/index.ts';

export default shapeStack(
  'self-observe',
  {
    AGENT: durableObject<Observer>('Observer'),
    LOADER: workerLoader('LOADER'),
    AI: workersAi('AI'),
  },
  { gateway: { binding: 'GATEWAY' } },
);
