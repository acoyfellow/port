import type { Entry } from '../../shared/entry.ts';

export const SHAPE: Entry = {
  slug: 'workflow-plan',
  mark: 'WP',
  name: 'Agent plan run by a Workflow',
  oneLine:
    'The agent writes a plan. A Cloudflare Workflow then runs each step as its own durable step, retries a step that fails and never repeats one that finished.',
  stage: 'verified',
  shape: '1 plan = 1 Workflow instance; each step calls 1 Pi Durable Object',
  parts: [
    {
      id: 'worker',
      label: 'Router Worker',
      detail: 'Starts the Workflow and reports its state.',
      product: 'worker',
    },
    {
      id: 'workflow',
      label: 'Workflow',
      detail:
        'Reads the plan, then runs one step.do per plan step with retries. A finished step is stored and is not run again.',
      product: 'workflow',
    },
    {
      id: 'agent',
      label: 'Planner',
      detail:
        'One Durable Object running stock Pi. It writes the plan, then does each step when the Workflow asks, and remembers which steps it finished.',
      product: 'durable-object',
    },
    {
      id: 'models',
      label: 'Workers AI',
      detail: 'Kimi K2.6 through the install’s AI Gateway.',
      product: 'workers-ai',
    },
  ],
  edges: [
    { from: 'worker', to: 'workflow', label: 'create' },
    { from: 'workflow', to: 'agent', label: 'step.do → runStep' },
    { from: 'agent', to: 'models', label: 'turn' },
  ],
  strengths: [
    'Each step is retried on its own, with a limit and a delay, by the platform.',
    'The Workflow keeps a history of every step, so you can see where a long task is.',
    'A Workflow can pause for hours or days (step.sleep, waitForEvent) without paying for the wait.',
  ],
  limits: [
    'Steps run one after another; this version does not run steps in parallel.',
    'The plan is fixed once the Workflow starts. Pi cannot add steps midway.',
    'Step 2 fails once on purpose in the test, to show the retry.',
  ],
  install: {
    status: 'ready',
    plan: 'One Worker with a Durable Object and a Workflow, and one AI Gateway.',
  },
  tools: 'in memory in the planner’s Durable Object.',
  traits: {
    runsIn: 'Workflow + Durable Object',
    isolation: 'One DO per plan',
    internet: 'none',
    state: 'Workflow history + DO SQLite',
    startup: 'instant',
  },
  evalPlan:
    'Pi writes a 3-step plan and is restarted mid-task. A Workflow runs the steps; step 2 fails once on purpose before doing any work. Pass when the Workflow completes, all 3 steps finished, the failed step was retried, and no step’s work ran twice.',
  source: 'Workflows',
  links: [{ label: 'Workflows', href: 'https://developers.cloudflare.com/workflows/' }],
};
