import { container, durableObject, shapeStack, workersAi } from '../kit/stack.ts';
import type { Directory, Person } from './src/index.ts';

export default shapeStack(
  'person-with-computer',
  {
    DIRECTORY: durableObject<Directory>('Directory'),
    PERSON: container<Person>('person-with-computer', 'Person'),
    AI: workersAi('AI'),
  },
  { gateway: { binding: 'GATEWAY' } },
);
