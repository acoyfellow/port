import type { Entry } from '../../shared/entry.ts';

export const SHAPE: Entry = {
  slug: 'isolate-agents',
  mark: 'DI',
  name: 'Durable agents, isolate tests',
  oneLine: 'Coding agents with no container. port installs them, runs the eval and tears them down.',
  stage: 'installable',
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
    'No shell, git or browser tools.',
    'A model call with no answer stops the task. There is no timeout yet.',
  ],
  install: {
    status: 'ready',
    plan: 'port uploads one Worker and creates one AI Gateway with your sign-in. Tear down deletes both and checks they are gone.',
  },
  tools:
    'in memory inside the agent’s Durable Object; files are stored in its SQLite, and node --test runs in a fresh Worker Loader isolate with no internet.',
  evalPlan:
    'swarm-5: 5 agents work on 5 tasks at the same time; port grades each with hidden tests and reports passes, turns, cost and time.',
  source: 'github.com/acoyfellow/port (shapes/isolate-agents)',
};
