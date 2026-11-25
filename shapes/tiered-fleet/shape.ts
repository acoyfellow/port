import type { Entry } from '../../shared/entry.ts';

export const SHAPE: Entry = {
  slug: 'tiered-fleet',
  mark: 'TF',
  name: 'Tiered isolate-first fleet (unthrottled)',
  oneLine:
    'Starts every seat in a zero-container Worker Loader isolate and lazily escalates only Linux subprocesses to a container, with no concurrency queue.',
  stage: 'verified',
  shape: 'N seats -> Agent DO (SQLite + Worker Loader isolate) -> lazy Vessel container on subprocess',
  parts: [
    {
      id: 'worker',
      label: 'Fleet Worker',
      detail: 'Routes each seat directly to its Agent DO and exposes /fleet/metrics from Tracker.',
      product: 'worker',
    },
    {
      id: 'agent',
      label: 'Agent DO',
      detail:
        'Runs stock Pi over MemoryExecutionEnv; routes pure JS/TS tests to Worker Loader and syncs to a container only on escalation.',
      product: 'durable-object',
    },
    {
      id: 'loader',
      label: 'Worker Loader',
      detail: 'Runs node --test inside a fresh network-free isolate with 0 container-seconds.',
      product: 'worker-loader',
    },
    {
      id: 'vessel',
      label: 'On-demand Vessel',
      detail: 'Basic container leased only when a command requires a real Linux subprocess.',
      product: 'container',
    },
    {
      id: 'tracker',
      label: 'Tracker DO',
      detail: 'Counts isolate vs container commands, escalated seats, and leased container-seconds.',
      product: 'durable-object',
    },
    {
      id: 'models',
      label: 'Workers AI',
      detail: 'DeepSeek V4.1 Flash through the install’s AI Gateway.',
      product: 'workers-ai',
    },
  ],
  edges: [
    { from: 'worker', to: 'agent', label: 'getByName' },
    { from: 'worker', to: 'tracker', label: 'metrics' },
    { from: 'agent', to: 'loader', label: 'node --test' },
    { from: 'agent', to: 'vessel', label: 'subprocess escalation' },
    { from: 'agent', to: 'models', label: 'turn' },
  ],
  strengths: [
    'Kept container usage to 11.1 s across 10 seats (0 s on 1 seat) by running default file/test work in isolates.',
    'Served as the controlled negative experiment proving that isolate-first execution without bounded concurrency still hits upstream Workers AI rate limits.',
  ],
  limits: [
    'Unthrottled 10-seat burst lost 8/10 seats to model_error (1/10 passed) — superseded by tiered-pull-fleet.',
    'No pre-admission budget guard or pull queue.',
  ],
  install: {
    status: 'ready',
    plan: 'One Worker with Agent DO, Tracker DO, Worker Loader, on-demand Vessel container, Workers AI, and an AI Gateway.',
  },
  tools:
    'in-memory SQLite + Worker Loader isolate for node --test; escalates to a leased basic container only when a Linux subprocess is needed.',
  traits: {
    runsIn: 'Durable Object + Worker Loader + lazy container',
    isolation: 'Isolate default; container on subprocess escalation',
    internet: 'on',
    state: 'DO SQLite + lazy container sync',
    startup: 'instant',
  },
  evalPlan:
    'Run 1 and 10 concurrent coding seats on Customer 0, compare pass rate and container-seconds against bounded tiered-pull-fleet, confirm 0 sweep leftovers.',
  source: 'port fleet-search',
};
