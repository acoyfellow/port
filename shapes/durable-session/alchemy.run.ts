import { durableObject, shapeStack } from '../kit/stack.ts';
import type { Session } from './src/index.ts';

export default shapeStack('durable-session', {
  SESSION: durableObject<Session>('Session'),
});
