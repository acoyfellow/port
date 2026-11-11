import { container, shapeStack, workersAi } from '../kit/stack.ts';
import type { Box } from './src/index.ts';

export default shapeStack(
  'nix-git',
  {
    BOX: container<Box>('nix-git', 'Box', { dockerfile: 'nix-git.Dockerfile' }),
    AI: workersAi('AI'),
  },
  { gateway: { binding: 'GATEWAY' } },
);
