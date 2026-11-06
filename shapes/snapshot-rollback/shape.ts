import type { Entry } from '../../shared/entry.ts';

export const SHAPE: Entry = {
  slug: 'snapshot-rollback',
  mark: 'SR',
  name: 'Computer with checkpoints',
  oneLine:
    'The agent saves checkpoints of its workspace at good points. When the work breaks, it throws the computer away and starts a fresh one from a checkpoint.',
  stage: 'verified',
  shape:
    '1 thread = 1 Durable Object = 1 container; checkpoints are /workspace archives in the Durable Object',
  parts: [
    {
      id: 'worker',
      label: 'Router Worker',
      detail: 'Routes each thread to its Durable Object.',
      product: 'worker',
    },
    {
      id: 'agent',
      label: 'Thread',
      detail:
        'One Durable Object per thread. Runs stock Pi and stores each checkpoint as a compressed archive in its own SQLite, apart from the container.',
      product: 'durable-object',
    },
    {
      id: 'box',
      label: 'Container',
      detail:
        'A Linux computer with a shell and a disk. save_checkpoint packs /workspace; rollback destroys the container, starts a new one and unpacks the checkpoint into it.',
      product: 'container',
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
    { from: 'agent', to: 'box', label: 'tar in / out' },
    { from: 'agent', to: 'models', label: 'turn' },
  ],
  strengths: [
    'Going back is one step and always works: the agent does not have to undo its own mistakes.',
    'A checkpoint holds every file in /workspace, including build output and files git ignores.',
    'Checkpoints live in the Durable Object, not the container, so they outlive the container that made them.',
    'Pi’s conversation lives in the Durable Object, apart from the container, so a rollback keeps the chat and loses only the broken files.',
  ],
  limits: [
    'Running processes do not come back; only the disk does.',
    'Only /workspace comes back. Packages installed elsewhere on the computer are lost. Cloudflare has whole-container snapshots (snapshotContainer), but they were not available for this container, so this version does not use them.',
    'Checkpoints count against the Durable Object’s storage, so this suits source trees, not large datasets.',
  ],
  install: {
    status: 'ready',
    plan: 'One Worker, one Durable Object with a container, the shared Pi box image copied into your registry, and one AI Gateway.',
  },
  tools: 'in the container; checkpoints are archives of /workspace kept in the Durable Object.',
  traits: {
    runsIn: 'Container',
    isolation: 'Container per thread',
    internet: 'on',
    state: 'DO SQLite (chat and checkpoints)',
    startup: 'container',
  },
  evalPlan:
    'Pi writes stats.py with tests, is restarted mid-task, resumes, gets the tests to pass and saves a checkpoint. The test then deletes every file in /workspace and rolls back. Pass when the broken workspace differs from the checkpoint, the rollback started a fresh container, and the restored files hash to the same value as at the checkpoint.',
  source: 'Returning to Development States',
  links: [
    {
      label:
        'Returning to Development States: When Full Sandbox Snapshots Help Coding Agents (arXiv 2610.13841)',
      href: 'https://arxiv.org/abs/2610.13841',
    },
  ],
};
