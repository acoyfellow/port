import { container, durableObject, shapeStack } from '../kit/stack.ts';
import type { Directory, Hark } from './src/index.ts';

export default shapeStack('person-with-computer', {
  DIRECTORY: durableObject<Directory>('Directory'),
  HARK: container<Hark>('person-with-computer', 'Hark'),
});
