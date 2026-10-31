import type { Entry } from '../../shared/entry.ts';

export const SHAPE: Entry = {
  slug: 'self-observe',
  mark: 'SO',
  name: 'Agents that watch themselves',
  oneLine:
    'The isolate-agents fleet with tools for self-observation: shrink, trace, mutate and a loop governor. Five arms, one eval.',
  stage: 'outlined',
  shape: '1 agent = 1 Durable Object; tests run in a new Worker Loader isolate',
  parts: [
    {
      id: 'port',
      label: 'port',
      detail: 'installs, runs and tears down with your sign-in',
      product: 'external',
    },
    { id: 'worker', label: 'Fleet Worker', detail: 'port-fleet-<id>.workers.dev', product: 'worker' },
    {
      id: 'agent',
      label: 'Agent Durable Object',
      detail: 'one per agent: loop, files',
      product: 'durable-object',
    },
    {
      id: 'loader',
      label: 'Worker Loader',
      detail: 'tests run in a fresh isolate',
      product: 'worker-loader',
    },
    { id: 'ai', label: 'Workers AI', detail: 'model calls on your bill', product: 'workers-ai' },
    { id: 'gateway', label: 'AI Gateway', detail: 'logs and limits for model calls', product: 'ai-gateway' },
  ],
  edges: [
    { from: 'port', to: 'worker', label: 'upload, run, delete' },
    { from: 'worker', to: 'agent' },
    { from: 'agent', to: 'loader' },
    { from: 'agent', to: 'ai' },
    { from: 'ai', to: 'gateway' },
  ],
  strengths: [
    'No container. The agent loop sleeps in a Durable Object while it waits on the model.',
    'Tests run in a new isolate for each run, so agents cannot read each other.',
    'port runs the install, the eval and the tear down on your account.',
  ],
  limits: [
    '28 of 141 seats died on Workers AI timeouts before any work and were left out, so arm sizes differ.',
    'Five small tasks, one model, at most 6 seats per arm and task: differences of one or two passes are noise.',
    'sku-glob failed in every arm, so it measures nothing between arms.',
    'Grounded eval: baseline passed 0, 1 or 11 of 11 on each task. No task sat near 30 to 40 percent, so the clue had two tasks to help on.',
    'Grounded eval: the baseline seats ran before a Workers AI outage and the grounded seats ran during and after it.',
    'No shell, git or browser tools.',
    'A model call with no answer stops the task. There is no timeout yet.',
  ],
  measures: [
    {
      label: 'Governor arm: hidden tests passed, Kimi K2.6',
      value: '17 of 20 (85%), $0.033 per pass',
      source: 'proof/shapes/self-observe.json',
    },
    {
      label: 'Baseline arm: hidden tests passed',
      value: '14 of 20 (70%), $0.044 per pass',
      source: 'proof/shapes/self-observe.json',
    },
    {
      label: 'Shrink and trace arm',
      value: '19 of 29 (66%), $0.066 per pass',
      source: 'proof/shapes/self-observe.json',
    },
    {
      label: 'Mutate arm',
      value: '10 of 20 (50%), $0.071 per pass',
      source: 'proof/shapes/self-observe.json',
    },
    {
      label: 'All tools',
      value: '14 of 24 (58%), $0.073 per pass',
      source: 'proof/shapes/self-observe.json',
    },
    {
      label: 'Model spend, 141 seats over two runs',
      value: '$4.24',
      source: 'proof/shapes/self-observe.json',
    },
    {
      label: 'Grounded arm vs baseline, hard-5, 60 seats each: verdict KILL',
      value: '39 of 60 (65%) at $0.096 per pass vs 36 of 60 (60%) at $0.066 per pass, 1.47x cost',
      source: 'proof/self-observe/grounded-hard5.json',
    },
    {
      label: 'Grounded arm on the two tasks baseline almost never solves',
      value: 'sku-glob 1 of 11 vs 0 of 11, csv-parse 2 of 11 vs 1 of 11',
      source: 'proof/self-observe/grounded-hard5.json',
    },
  ],
  install: {
    status: 'ready',
    plan: 'port uploads one Worker and creates one AI Gateway with your sign-in. Tear down deletes both and checks they are gone.',
  },
  evalPlan:
    'swarm-5: 5 agents work on 5 tasks at the same time; port grades each with hidden tests and reports passes, turns, cost and time.',
  source: 'github.com/acoyfellow/port (shapes/isolate-agents)',
};
