import { durableObject, shapeStack, workerLoader, workersAi } from '../kit/stack.ts';
import type { Agent } from './src/index.ts';

export default shapeStack(
  'self-observe',
  {
    AGENT: durableObject<Agent>('Agent'),
    LOADER: workerLoader('LOADER'),
    AI: workersAi('AI'),
  },
  { gateway: { binding: 'GATEWAY' }, secret: { binding: 'FLEET_KEY', env: 'SHAPE_KEY' } },
);
