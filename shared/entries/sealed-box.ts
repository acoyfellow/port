import type { Entry } from '../entry.ts';

export const ENTRY: Entry = {
  slug: 'sealed-box',
  mark: 'SB',
  name: 'Sealed box per run',
  oneLine: 'Send one task to a container with internet off. Get the answer and a receipt tied to that task.',
  stage: 'verified',
  shape: '1 run = 1 Durable Object = 1 container with internet off',
  parts: [
    {
      id: 'control',
      label: 'Control Worker',
      detail: 'API for spawn, status, logs and cancel; checks login and budget',
      product: 'worker',
    },
    {
      id: 'run',
      label: 'Run Durable Object',
      detail: 'one per run: state, contract, deadline',
      product: 'durable-object',
    },
    {
      id: 'budget',
      label: 'Budget Durable Object',
      detail: 'one per user: active runs and rate limits',
      product: 'durable-object',
    },
    {
      id: 'box',
      label: 'Sealed box',
      detail: 'container per run, 1 CPU, 459 MB, no internet, about 1 agent per box',
      product: 'container',
    },
    {
      id: 'ai',
      label: 'Workers AI',
      detail: 'only host the box can reach, through the Worker',
      product: 'workers-ai',
    },
    { id: 'store', label: 'KV and R2', detail: 'ledger, policy and run artifacts', product: 'r2' },
  ],
  edges: [
    { from: 'control', to: 'budget', label: 'admit' },
    { from: 'control', to: 'run', label: 'spawn' },
    { from: 'run', to: 'box', label: 'start' },
    { from: 'box', to: 'ai', label: 'model calls' },
    { from: 'run', to: 'store', label: 'logs, receipt' },
  ],
  strengths: [
    'The box has internet off. It can reach only the model host.',
    'A run is done only when the agent echoes the run ID, the task fingerprint and the nonce.',
    'A budget for each user limits active runs, runs per minute and runs per day.',
  ],
  limits: [
    'A verified answer came from your task. It can still be wrong.',
    'The agent cannot see your files. It gets only the task text.',
    'The first run waits 1 to 3 minutes for the container to start.',
    'The default config allows 20 boxes at once.',
  ],
  measures: [
    { label: 'Max boxes at once', value: '20', source: 'wrangler.jsonc' },
    {
      label: 'Small fix tasks passed, 8 at once (Llama 3.3 70B)',
      value: '18 of 24',
      source: 'evals/parallel-offload/results/2026-10-11T10-54-03-cloud-c8.json',
    },
    {
      label: 'Median seconds per job, 8 at once',
      value: '25.6',
      source: 'evals/parallel-offload/results/2026-10-11T10-54-03-cloud-c8.json',
    },
  ],
  install: {
    status: 'planned',
    plan: 'An Alchemy v2 project would create one Worker with static assets, five SQLite Durable Object classes, one Workflow, one KV namespace, one R2 bucket and a Workers AI binding. The hard part is the container: the image must be built and pushed from Dockerfile.pi, and the first start is slow. Login needs Cloudflare Access or an OAuth app in front of the Worker, which port cannot create for the user without extra steps.',
  },
  evalPlan:
    'port would send the 5 swarm-5 tasks as 5 background runs, one box each, then grade each answer with hidden tests. It would report passes, verified receipts, cold start time, wall time per run and model cost.',
  source: 'github.com/acoyfellow/terrarium',
  receipt: 'proof/shapes/sealed-box.json',
};
