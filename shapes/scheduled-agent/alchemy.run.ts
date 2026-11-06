import { durableObject, shapeStack, workersAi } from '../kit/stack.ts';
import type { Agent, Clock } from './src/index.ts';

export default shapeStack(
  'scheduled-agent',
  { AGENT: durableObject<Agent>('Agent'), CLOCK: durableObject<Clock>('Clock'), AI: workersAi('AI') },
  { gateway: { binding: 'GATEWAY' } },
);
