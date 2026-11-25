import type { Entry } from '../../shared/entry.ts';

export const SHAPE: Entry = {
  slug: 'tiered-pull-fleet',
  mark: 'TP',
  name: 'Tiered pull-queue fleet',
  oneLine:
    'Combines a 3-wide weighted pull queue and budget admission with isolate-first execution and lazy container escalation. Cheapest per accepted task of all 6 tested fleet architectures.',
  stage: 'verified',
  shape:
    'N seats -> Coordinator DO (3-wide pull queue + admission) -> Seat DO (isolate first, lazy container)',
  parts: [
    {
      id: 'worker',
      label: 'Fleet Worker',
      detail: 'Exposes /fleet/submit, /fleet/metrics, /status and /files.',
      product: 'worker',
    },
    {
      id: 'coordinator',
      label: 'Coordinator DO',
      detail:
        'Bounds active LLM concurrency to 3 slots, pulls highest-weight queued seats next, enforces budget admission, and meters exact isolate vs container commands.',
      product: 'durable-object',
    },
    {
      id: 'seat',
      label: 'Seat DO',
      detail:
        'Runs stock Pi on MemoryExecutionEnv with 81 just-bash isolate builtins; diffs and syncs changed files in parallel only when a command escalates.',
      product: 'durable-object',
    },
    {
      id: 'loader',
      label: 'Worker Loader',
      detail: 'Runs node --test in an instant isolate (84% of commands stayed container-free at 10 seats).',
      product: 'worker-loader',
    },
    {
      id: 'vessel',
      label: 'Lazy Vessel container',
      detail: 'Basic container leased only for external Linux binaries (python3, git, etc.).',
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
    { from: 'coordinator', to: 'seat', label: 'assign slot (3-wide)' },
    { from: 'seat', to: 'loader', label: 'node --test (84%)' },
    { from: 'seat', to: 'vessel', label: 'lazy subprocess' },
    { from: 'seat', to: 'models', label: 'turn' },
  ],
  strengths: [
    'Cheapest per accepted task at 10 seats ($0.0088 total/ok): strictly dominates container-per-thread (5/10, $0.0097/ok, 246 s) and shared-container (3/10, $0.0234/ok, 313 s).',
    '2.5x faster 10-seat makespan (194.2 s vs 482.9 s) and 6.7x fewer container-seconds (106.6 s vs 718.1 s) than pull-fleet; 5 of 10 seats used 0 container-seconds.',
    'Subprocess escalation verified live: python3 -c "print(6 * 7)" lazily leased the container, wrote 42, metered 93.1 s, and swept 0 leftovers.',
  ],
  limits: [
    'Two seats at 10-seat scale still hit upstream Workers AI model_error (8/10 passed); automatic 1-retry on model_error is not wired into Coordinator yet.',
    'Single 10-seat run on DeepSeek V4.1 Flash so far; multi-repeat variance not yet measured.',
    'Escalated container calls do not sync files written by container subprocesses back to SQLite.',
  ],
  install: {
    status: 'ready',
    plan: 'One Worker with Coordinator DO, Seat DO, Worker Loader, lazy Vessel container, Workers AI, and an AI Gateway.',
  },
  tools:
    'in-memory SQLite + 81 just-bash builtins + Worker Loader for node --test; lazily diffs and syncs files to a leased container only for real Linux binaries.',
  traits: {
    runsIn: 'Coordinator DO + Seat DO + Worker Loader + lazy container',
    isolation: '3-wide bounded slots; isolate default + lazy container',
    internet: 'on',
    state: 'DO SQLite + incremental container sync',
    startup: 'instant',
  },
  evalPlan:
    'Measure 1 and 10 concurrent coding seats on Customer 0 plus a live python3 subprocess escalation check; verify DO-measured container-seconds, independent hidden grades, and 0 sweep leftovers.',
  source: 'port tiered-pull synthesis',
};
