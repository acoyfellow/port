import { Schema } from 'effect';

export const Readiness = Schema.Literals(['installable', 'building', 'planned']);

export type Readiness = typeof Readiness.Type;

export const Resource = Schema.Struct({
  kind: Schema.String,
  why: Schema.String,
});

export type Resource = typeof Resource.Type;

export const Entry = Schema.Struct({
  slug: Schema.String,
  name: Schema.String,
  oneLine: Schema.String,
  readiness: Readiness,
  resources: Schema.Array(Resource),
  scopes: Schema.Array(Schema.String),
  monthlyFloorUsd: Schema.Number,
  evidence: Schema.Array(Schema.String),
});

export type Entry = typeof Entry.Type;

export const CATALOG: readonly Entry[] = [
  {
    slug: 'fleet',
    name: 'Agent fleet',
    oneLine:
      'Many agents on your account. Each agent thinks in a Durable Object and only rents a computer for the few calls that need one.',
    readiness: 'building',
    resources: [
      { kind: 'Worker', why: 'Front door and API for the fleet' },
      {
        kind: 'Durable Object',
        why: 'One per agent: the loop, the session, the files',
      },
      {
        kind: 'Worker Loader',
        why: 'Runs JS and tests in an isolate, no container',
      },
      { kind: 'Artifacts', why: 'Git repo per agent workspace' },
      {
        kind: 'Container',
        why: 'Shared pool for the rare real shell, git, or browser call',
      },
      { kind: 'AI Gateway', why: 'Model calls billed to your account' },
    ],
    scopes: ['workers-scripts.edit', 'containers.write', 'artifacts.write', 'aig.write', 'aig.run'],
    monthlyFloorUsd: 5,
    evidence: [
      'swarm-5: tools ran 9.5 s of 14.8 min across 5 agents',
      'swarm-5: 54% of calls were file reads and edits, 45% JS and tests, 1% general shell',
      'swarm-5: 0 cross-agent reads in 260 attempts',
    ],
  },
  {
    slug: 'chat-ax',
    name: 'chat-ax',
    oneLine: 'Private agent chats. One Durable Object per conversation, sleeps between turns.',
    readiness: 'planned',
    resources: [
      { kind: 'Worker', why: 'Chat UI and API' },
      { kind: 'Durable Object', why: 'One per conversation' },
    ],
    scopes: ['workers-scripts.edit', 'aig.run'],
    monthlyFloorUsd: 5,
    evidence: [],
  },
  {
    slug: 'coil',
    name: 'coil',
    oneLine: 'A coding agent with its own computer for each thread.',
    readiness: 'planned',
    resources: [
      { kind: 'Worker', why: 'App and API' },
      { kind: 'Durable Object', why: 'One per thread' },
      { kind: 'Container', why: 'One per thread, alive while the thread is' },
    ],
    scopes: ['workers-scripts.edit', 'containers.write', 'aig.run'],
    monthlyFloorUsd: 5,
    evidence: ['Container idle about 99% of a thread, measured in swarm-5'],
  },
  {
    slug: 'skin',
    name: 'skin',
    oneLine: 'An app you change by asking. The agent rewrites it while you use it, behind a gate.',
    readiness: 'planned',
    resources: [
      { kind: 'Worker', why: 'Kernel: sign-in, agent, versions, rollback' },
      { kind: 'Worker Loader', why: 'Builds and gates each new version' },
    ],
    scopes: ['workers-scripts.edit', 'aig.run'],
    monthlyFloorUsd: 5,
    evidence: [],
  },
  {
    slug: 'my-ax',
    name: 'my-ax',
    oneLine: 'One agent, many conversations, one workspace.',
    readiness: 'planned',
    resources: [
      { kind: 'Worker', why: 'App and API' },
      { kind: 'Durable Object', why: 'The agent and its workspace' },
    ],
    scopes: ['workers-scripts.edit', 'aig.run'],
    monthlyFloorUsd: 5,
    evidence: [],
  },
  {
    slug: 'hark',
    name: 'hark',
    oneLine: 'Listed for completeness. Details to come.',
    readiness: 'planned',
    resources: [{ kind: 'Worker', why: 'To be decided' }],
    scopes: ['workers-scripts.edit'],
    monthlyFloorUsd: 0,
    evidence: [],
  },
];
