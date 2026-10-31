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
    'No container. Pi sleeps in a Durable Object while it waits on the model.',
    'Shrink, trace and mutate run the agent’s code in a new isolate each time, with no internet.',
    'Same stock Pi as every other shape, so a run here compares directly with isolate-agents.',
  ],
  limits: [
    'No eval has run on stock Pi yet. The earlier arm numbers came from a hand-written loop and were removed.',
    'Mutate runs your tests up to 30 times, so it is slow on a big test suite.',
    'No git or browser tools.',
  ],
  install: {
    status: 'planned',
    plan: 'port would upload the same Worker as isolate-agents with the three extra tools. The one-click install is not wired yet.',
  },
  tools:
    'in memory in the Durable Object, like isolate-agents, plus three Pi tools, shrink, trace and mutate, that run the agent’s code in fresh Worker Loader isolates.',
  traits: {
    runsIn: 'Durable Object + isolates',
    isolation: 'Isolate per tool call',
    internet: 'off',
    state: 'DO SQLite',
    startup: 'instant',
  },
  evalPlan:
    'swarm-5: 5 agents work on 5 tasks at the same time; port grades each with hidden tests and reports passes, turns, cost and time.',
  source: 'github.com/acoyfellow/port (shapes/isolate-agents)',
};
