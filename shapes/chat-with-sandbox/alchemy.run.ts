import { container, shapeStack, workersAi } from '../kit/stack.ts';
import type { Chat } from './src/index.ts';

export default shapeStack(
  'chat-with-sandbox',
  { CHAT: container<Chat>('chat-with-sandbox', 'Chat'), AI: workersAi('AI') },
  { gateway: { binding: 'GATEWAY' } },
);
