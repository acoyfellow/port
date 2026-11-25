import type { Entry } from '../../shared/entry.ts';

export const SHAPE: Entry = {
  slug: 'pull-fleet',
  mark: 'PF',
  name: 'Pull-queue warm vessel fleet',
  oneLine:
    'A Coordinator Durable Object meters budget and dispatches weighted seats across a bounded pool of 3 warm containers, eliminating 10-way LLM rate-limit bursts and extra container cold starts.',
  stage: 'verified',
  shape: 'N seats -> 1 Coordinator DO (weighted pull queue + admission) -> 3 warm pooled containers',
  parts: [
    {
      id: 'worker',
      label: 'Fleet Worker',
      detail: 'Exposes /fleet/submit, /fleet/metrics, /status and /files for every seat.',
      product: 'worker',
    },
    {
      id: 'coordinator',
      label: 'Coordinator DO',
      detail:
        'Holds the weighted pull queue, enforces worst-case budget admission, hands freed warm vessels to the next seat, and meters exact container-seconds.',
      product: 'durable-object',
    },
    {
      id: 'seat',
      label: 'Seat DO',
      detail: 'One SQLite Durable Object per seat running stock Pi inside its own /workspace/<seat> folder.',
      product: 'durable-object',
    },
    {
      id: 'vessel',
      label: 'Vessel pool (3 containers)',
      detail:
        'Bounded pool of 3 basic containers reused across waves so tasks 4..N skip cold starts and never thundering-herd Workers AI.',
      product: 'container',
    },
    {
      id: 'models',
      label: 'Workers AI',
      detail: 'DeepSeek V4.1 Flash through the install’s AI Gateway.',
      product: 'workers-ai',
    },
  ],
  edges: [
    { from: 'worker', to: 'coordinator', label: 'submit / metrics' },
    { from: 'coordinator', to: 'seat', label: 'assign vessel' },
    { from: 'seat', to: 'vessel', label: 'tool calls' },
    { from: 'seat', to: 'models', label: 'turn' },
  ],
  strengths: [
    'Achieved 9/10 (90%) pass rate at 10 concurrent seats on DeepSeek V4.1 Flash vs 2/10 isolate-agents, 3/10 shared-container, and 5/10 container-per-thread.',
    'Cut container-seconds per accepted task 3.8x vs container-per-thread (79.8 s vs 302.0 s) while using 3.3x fewer container instances.',
    'Enforces pre-admission budget reservations and frees unused spend when each seat finishes.',
  ],
  limits: [
    'Higher 10-seat makespan (482.9 s) than tiered-pull-fleet (194.2 s) because every seat still uses a container even for pure TypeScript tasks.',
    'Coordinator does not yet auto-retry a seat that hits a transient model_error.',
    'Measured on DeepSeek V4.1 Flash (not deprecated Kimi K2.6), single 10-seat run so far.',
  ],
  install: {
    status: 'ready',
    plan: 'One Worker with Coordinator DO, Seat DO, a 3-instance Vessel container pool, Workers AI, and an AI Gateway.',
  },
  tools:
    'on whichever warm Vessel container (vessel-1..3) the Coordinator assigned to this seat, isolated in /workspace/<seatId>.',
  traits: {
    runsIn: 'Coordinator DO + Seat DO + 3 pooled containers',
    isolation: 'Per-seat directory on pooled container + budget admission',
    internet: 'on',
    state: 'DO SQLite + pooled container disk',
    startup: 'container',
  },
  evalPlan:
    'Submit 1 and 10 concurrent coding seats on Customer 0, grade every seat independently with hidden tests, verify Coordinator-measured container-seconds and 0 sweep leftovers.',
  source: 'port fleet-search',
};
