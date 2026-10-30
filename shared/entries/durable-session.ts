import type { Entry } from '../entry.ts';

export const ENTRY: Entry = {
  slug: 'durable-session',
  mark: 'DS',
  name: 'Durable Pi session',
  oneLine: 'A Pi coding agent in a Durable Object. The session continues after the object restarts.',
  stage: 'verified',
  shape: '1 conversation = 1 Durable Object with the Pi session in SQLite',
  parts: [
    {
      id: 'worker',
      label: 'Worker',
      detail:
        'Serves the client assets, checks Cloudflare Access, and routes requests and WebSockets to the agent.',
      product: 'worker',
    },
    {
      id: 'access',
      label: 'Cloudflare Access',
      detail: 'Gates the app. The worker reads ACCESS_TEAM_DOMAIN and ACCESS_AUD.',
      product: 'access',
    },
    {
      id: 'agent-do',
      label: 'Agent Durable Object',
      detail:
        'SQLite class Agent. Runs the Pi Durable harness as an Effect program and commits each model turn and tool result before the next step.',
      product: 'durable-object',
    },
    {
      id: 'ai',
      label: 'Workers AI',
      detail: 'AI binding with the model set in the MODEL var.',
      product: 'workers-ai',
    },
    {
      id: 'artifacts',
      label: 'Artifacts repo',
      detail: 'ARTIFACTS binding. The write_file tool makes one git commit per call.',
      product: 'external',
    },
  ],
  edges: [
    { from: 'access', to: 'worker', label: 'signed request' },
    { from: 'worker', to: 'agent-do', label: 'RPC and WebSocket' },
    { from: 'agent-do', to: 'ai', label: 'model turn' },
    { from: 'agent-do', to: 'artifacts', label: 'git commit' },
  ],
  strengths: [
    'The agent survives ctx.abort(). An alarm one second later starts a new instance that continues from the last commit in SQLite.',
    'A 15-second watchdog alarm restarts an unfinished task after a deploy, an eviction, or an uncaught exception.',
    'The SQLite adapter passes the 23-case Pi Durable storage suite inside real workerd on every check.',
    'pi-ext-durable loads a stock Pi extension into an Agents SDK Durable Object through a shim, with no API key in the proof.',
  ],
  limits: [
    'Every tool must be safe to run twice, because a kill after a tool runs but before its result is saved runs it again.',
    'No Workflows binding or container is in either repo. Extensions that need Node APIs such as child_process do not run.',
    'The real pi-coding-agent package is about 7 MB and fails at startup in a Worker, so extensions depend on a shim.',
    'It is not safe on the open internet. Anyone who reaches it spends the Workers AI budget.',
  ],
  measures: [
    {
      label: 'kill5 run',
      value: '5 kills, 6 lives, 1 commit, 1 file',
      source: 'tardigrade/README.md',
    },
    {
      label: 'Storage conformance cases in workerd',
      value: '23 of 23',
      source: 'tardigrade/test/conformance/',
    },
    {
      label: 'Offline revival test',
      value: '3 kills, 4 lives, finished file',
      source: 'tardigrade/test/revival/',
    },
    {
      label: 'Revive delay after kill',
      value: '1 s',
      source: 'tardigrade/worker/conversation.ts',
    },
  ],
  install: {
    status: 'planned',
    plan: 'An Alchemy v2 (Effect v4) stack needs one Worker with static assets, a SQLite Durable Object class Agent with migrations, an AI binding, an Artifacts binding, and the MODEL var. Cloudflare Access is the hard part: it needs an Access application on the user account, and its team domain and audience must go into the worker vars. Artifacts may need account enablement. No containers, secrets, or OAuth apps are needed.',
  },
  evalPlan:
    'Run swarm-5 with one Durable Object per task. Seed each task repo in Artifacts, send the task, and run the hidden tests on the final commit. Run each task twice: once clean, and once with kills every 9.5 seconds as in npm run kill5. Measure tasks passed, lives used, extra commits from replayed steps, and wall time to the last commit. Node-based test runners need a container, which this shape does not have, so the tests run outside the agent.',
  source: 'https://github.com/acoyfellow/pi-ext-durable',
  receipt: 'proof/shapes/durable-session.json',
};
