import { durableObject, shapeStack, workersAi } from '../kit/stack.ts';
import type { Room, RoomAgent } from './src/index.ts';

export default shapeStack(
  'agent-room',
  { ROOM: durableObject<Room>('Room'), AGENT: durableObject<RoomAgent>('RoomAgent'), AI: workersAi('AI') },
  { gateway: { binding: 'GATEWAY' } },
);
