import { durableObject, shapeStack, workerLoader } from '../kit/stack.ts';
import type { Body } from './src/index.ts';

export default shapeStack('self-editing-app', {
  BODY: durableObject<Body>('Body'),
  LOADER: workerLoader('LOADER'),
});
