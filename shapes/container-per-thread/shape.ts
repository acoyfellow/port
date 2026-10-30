import type { Entry } from '../entry.ts';

export const ENTRY: Entry = {
  slug: 'container-per-thread',
  mark: 'CT',
  name: 'Container per thread',
  oneLine: 'Each agent thread has its own container with a terminal, Chrome and a disk.',
  stage: 'verified',
  shape: '1 thread = 1 agent = 1 container',
  parts: [
    {
      id: 'worker',
      label: 'coil Worker',
      detail: 'One Worker serves the PWA, REST API, MCP endpoint, and docs.',
      product: 'worker',
    },
    {
      id: 'access',
      label: 'Sign-in',
      detail: 'Zero Trust Access by default, or Cloudflare OAuth in cloudflare mode.',
      product: 'access',
    },
    {
      id: 'thread',
      label: 'Thread DO',
      detail: 'One SQLite Durable Object per thread. It runs the Pi agent and owns the container.',
      product: 'durable-object',
    },
    {
      id: 'computer',
      label: 'Computer',
      detail: 'Container per thread with terminals, Chrome, and a disk. It pauses after 9 idle minutes.',
      product: 'container',
    },
    {
      id: 'directory',
      label: 'Directory and connectors',
      detail: 'Directory DO lists threads per owner. ConnectorStore DO holds connector state.',
      product: 'durable-object',
    },
    {
      id: 'loader',
      label: 'Script runner',
      detail: 'Worker Loader runs coil_run scripts with no network access of their own.',
      product: 'worker-loader',
    },
    {
      id: 'ai',
      label: 'Model',
      detail: 'Workers AI through AI Gateway, or gateway models via a gateway token.',
      product: 'workers-ai',
    },
  ],
  edges: [
    { from: 'access', to: 'worker', label: 'signed request' },
    { from: 'worker', to: 'directory', label: 'list threads' },
    { from: 'worker', to: 'thread', label: 'turn' },
    { from: 'worker', to: 'loader', label: 'coil_run' },
    { from: 'thread', to: 'computer', label: 'exec, browser' },
    { from: 'thread', to: 'ai', label: 'model call' },
  ],
  strengths: [
    'The user and the agent share the same terminals, Chrome, and disk from any device.',
    'A thread killed mid-turn finishes the same request once after resume.',
    'One capability list drives MCP tools, REST, llms.txt, and docs.',
    'One thread cannot see the files of another thread.',
  ],
  limits: [
    'A resumed computer gets its disk back but not its processes.',
    'Agent commands stop after 120 seconds.',
    'The containers have internet access, so do not run hostile code in them.',
    'Disk snapshots stay after a thread ends, because the container binding has no delete call yet.',
  ],
  measures: [
    {
      label: 'Tool time vs model time, swarm-5, 5 seats',
      value: 'tools 9.5 s of 14.8 min model time',
      source: 'gleam-agents/proof/swarm-5/tool-mix.json',
    },
    {
      label: 'Idle pause',
      value: '9 min',
      source: 'coil/README.md',
    },
    {
      label: 'Lighthouse',
      value: '99 / 100 / 100 / 100',
      source: 'coil/receipts/lighthouse-v5.json',
    },
  ],
  install: {
    status: 'planned',
    plan: 'An Alchemy v2 project must create one Worker with assets, a Worker Loader binding, an AI binding, and three SQLite Durable Object classes: Thread, Directory, and ConnectorStore. Thread is also a container class with a Dockerfile image. The container image is hard: it depends on a prebuilt Nix base image in a registry, and the build must push it to the user account. Sign-in is hard: access mode needs a Zero Trust Access app and audience; cloudflare mode needs an OAuth app and a session secret. A model gateway token is a secret minted per deploy.',
  },
  evalPlan:
    'Port can run swarm-5 by creating 5 threads through POST /api/threads/:name/messages with wait true, one task per thread. Each thread writes code in its own container, then port copies the files out with thread_read_file and runs the hidden tests outside. Measure pass count, wall time per seat, model time vs tool time, cold start of the container, and cost per seat.',
  source: 'https://github.com/acoyfellow/coil',
};
