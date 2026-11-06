import type { Entry } from '../../shared/entry.ts';

export const SHAPE: Entry = {
  slug: 'scheduled-agent',
  mark: 'SC',
  name: 'Agent on a schedule',
  oneLine:
    'The agent wakes up on its own at set times, does its job and goes back to sleep. Nobody has to send it a message.',
  stage: 'verified',
  shape: '1 agent = 1 Durable Object; 1 clock Durable Object wakes it by alarm',
  parts: [
    {
      id: 'worker',
      label: 'Router Worker',
      detail: 'Routes requests and starts the schedule.',
      product: 'worker',
    },
    {
      id: 'clock',
      label: 'Clock',
      detail:
        'A Durable Object with an alarm. Each time the alarm fires it sends the agent its next job and sets the next alarm.',
      product: 'durable-object',
    },
    {
      id: 'agent',
      label: 'Agent',
      detail:
        'One Durable Object running stock Pi. Each scheduled job is a new turn in the same conversation.',
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
    { from: 'worker', to: 'clock', label: 'start' },
    { from: 'clock', to: 'agent', label: 'alarm → submit' },
    { from: 'agent', to: 'models', label: 'turn' },
  ],
  strengths: [
    'Costs almost nothing between runs: a sleeping Durable Object is not billed for time.',
    'Each run continues the same conversation, so the agent remembers earlier runs.',
    'Alarms survive restarts and deploys, so a missed wake-up is retried.',
  ],
  limits: [
    'The test runs every 20 seconds and stops after 3 runs. Real jobs would run hourly or daily.',
    'One schedule per agent. No calendar rules like "weekdays at 9".',
    'Cron Triggers on the Worker are another way to do this; this shape uses per-agent alarms instead.',
  ],
  install: {
    status: 'ready',
    plan: 'One Worker with two Durable Objects (agent and clock) and one AI Gateway.',
  },
  tools: 'in memory in the agent’s Durable Object.',
  traits: {
    runsIn: 'Durable Object',
    isolation: 'One DO per agent',
    internet: 'none',
    state: 'DO SQLite',
    startup: 'instant',
  },
  evalPlan:
    'Pi sets up a job, is restarted mid-task and resumes. Then the clock is started and no more requests go to the agent. Pass when the clock woke the agent at least twice by alarm and Pi wrote one log line per run.',
  source: 'Durable Object alarms',
  links: [
    { label: 'Durable Object alarms', href: 'https://developers.cloudflare.com/durable-objects/api/alarms/' },
  ],
};
