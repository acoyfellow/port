import type { Entry } from '../entry.ts';

export const ENTRY: Entry = {
  slug: 'fleet',
  mark: 'F',
  name: 'Agent fleet',
  oneLine:
    'Coding agents on your own account with no container. port installs it, runs the eval and tears it down.',
  stage: 'installable',
  shape: '1 agent = 1 Durable Object; tests run in a fresh Worker Loader isolate',
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
    'No container: the agent loop sleeps in a Durable Object while it waits on the model',
    'Tests run in a fresh isolate per run, so agents cannot read each other',
    'Install, eval and tear down all run from port on your account',
  ],
  limits: [
    'No shell, git or browser tools',
    'A model call with no answer hangs the task; there is no timeout yet',
  ],
  measures: [
    { label: 'swarm-5 hidden tests passed (Kimi K2.7 Code)', value: '4 of 5', source: 'eval.json' },
    { label: 'Model cost for the whole run', value: '$0.088', source: 'eval.json' },
    { label: 'Resources installed and removed', value: '2 of 2', source: 'teardown.json' },
  ],
  install: {
    status: 'ready',
    plan: 'port uploads one Worker and creates one AI Gateway with your sign-in. Tear down deletes both and checks they are gone.',
  },
  evalPlan:
    'swarm-5: 5 agents work on 5 tasks at the same time; port grades each with hidden tests and reports passes, turns, cost and time.',
  source: 'github.com/acoyfellow/port (fleet/)',
};
