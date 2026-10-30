import { durableObject, shapeStack } from '../kit/stack.ts';
import type { AgentDO, ChatRoomDO } from './src/index.ts';

export default shapeStack('agent-room', {
  ROOM: durableObject<ChatRoomDO>('ChatRoomDO'),
  AGENT: durableObject<AgentDO>('AgentDO'),
});
