import * as Cloudflare from 'alchemy/Cloudflare';
import { durableObject, shapeStack, workerName, workersAi } from '../kit/stack.ts';
import type { Planner } from './src/index.ts';

export default shapeStack(
  'workflow-plan',
  {
    PLANNER: durableObject<Planner>('Planner'),
    PLAN: Cloudflare.Workflow('PlanWorkflow', {
      className: 'PlanWorkflow',
      workflowName: workerName('workflow-plan'),
    }),
    AI: workersAi('AI'),
  },
  { gateway: { binding: 'GATEWAY' } },
);
