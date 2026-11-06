import type { Entry } from '../../shared/entry.ts';

export const SHAPE: Entry = {
  slug: 'flight-recorder',
  mark: 'FR',
  name: 'Agent with a flight recorder',
  oneLine:
    'Every tool call the agent makes is written down by a separate Worker the agent cannot reach. The agent cannot hide or erase what it did.',
  stage: 'verified',
  shape: '1 session = 1 Durable Object; 1 Tail Worker records every tool call',
  parts: [
    {
      id: 'worker',
      label: 'Session Worker',
      detail: 'Routes each session to its Durable Object.',
      product: 'worker',
    },
    {
      id: 'agent',
      label: 'Session',
      detail: 'One Durable Object running stock Pi. A hook logs each tool call as it starts.',
      product: 'durable-object',
    },
    {
      id: 'recorder',
      label: 'Tail Worker',
      detail:
        'Cloudflare sends it the logs of every run of the session Worker after the fact. It keeps the tool calls in its own Durable Object. The agent has no binding to it that can write.',
      product: 'worker',
    },
    {
      id: 'models',
      label: 'Workers AI',
      detail: 'Kimi K2.6 through the install’s AI Gateway.',
      product: 'workers-ai',
    },
  ],
  edges: [
    { from: 'worker', to: 'agent', label: 'getByName' },
    { from: 'agent', to: 'recorder', label: 'tail (platform)' },
    { from: 'agent', to: 'models', label: 'turn' },
  ],
  strengths: [
    'The record is outside the agent: Cloudflare delivers the logs, so the agent cannot skip or change them.',
    'Recording happens after the run, so it adds no time to tool calls.',
    'The same Tail Worker can watch many agent Workers at once.',
  ],
  limits: [
    'It records what the agent logs at the start of each call, not the full arguments or results.',
    'Tail delivery takes a few seconds, so the record is not live.',
    'The session Worker can read the record, but cannot write to it.',
  ],
  install: {
    status: 'ready',
    plan: 'Two Workers: the Tail Worker with its Durable Object, and the session Worker that names it as its tail consumer. One AI Gateway.',
  },
  tools: 'in memory in the session’s Durable Object.',
  traits: {
    runsIn: 'Durable Object',
    isolation: 'Audit log in a separate Worker',
    internet: 'none',
    state: 'DO SQLite + recorder DO',
    startup: 'instant',
  },
  evalPlan:
    'Pi writes and checks two files and is restarted mid-task. Pass when the Tail Worker recorded exactly as many tool calls as Pi made, by Pi’s own entries, and the agent has no write access to the record.',
  source: 'Tail Workers',
  links: [
    {
      label: 'Tail Workers',
      href: 'https://developers.cloudflare.com/workers/observability/logs/tail-workers/',
    },
  ],
};
