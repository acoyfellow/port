import { durableObject, shapeStack, workersAi } from '../kit/stack.ts';
import type { Session } from './src/index.ts';

export default shapeStack(
  'durable-session',
  { SESSION: durableObject<Session>('Session'), AI: workersAi('AI') },
  { gateway: { binding: 'GATEWAY' } },
);
