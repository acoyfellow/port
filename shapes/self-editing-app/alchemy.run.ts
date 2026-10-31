import { durableObject, shapeStack, workerLoader, workersAi } from '../kit/stack.ts';
import type { Body } from './src/index.ts';

export default shapeStack(
  'self-editing-app',
  { BODY: durableObject<Body>('Body'), LOADER: workerLoader('LOADER'), AI: workersAi('AI') },
  { gateway: { binding: 'GATEWAY' } },
);
