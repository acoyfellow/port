import type { Entry } from '../../shared/entry.ts';

const CFOS = 'https://github.com/cloudflare/cloudflare-os';

export const SHAPE: Entry = {
  slug: 'gadget-workspace',
  mark: 'GW',
  name: 'Workspace with gadgets and a gatekeeper',
  oneLine:
    'The bare Cloudflare OS pattern: Pi builds a private app as a facet of the workspace. Its only way out is a gatekeeper that queues actions for a person to approve.',
  stage: 'verified',
  shape: '1 workspace = 1 Durable Object; 1 gadget = 1 facet in a Dynamic Worker; 1 gatekeeper Worker',
  parts: [
    {
      id: 'worker',
      label: 'Workspace Worker',
      detail: 'Routes each workspace to its Durable Object. Holds no outside credentials.',
      product: 'worker',
    },
    {
      id: 'workspace',
      label: 'Workspace',
      detail: 'One Durable Object per workspace. Runs stock Pi and keeps the gadget source in SQLite.',
      product: 'durable-object',
    },
    {
      id: 'gadget',
      label: 'Gadget facet',
      detail:
        'The gadget’s server.js loads in a Dynamic Worker with internet off and runs as a facet of the workspace, with its own private SQLite. New code reloads; storage stays.',
      product: 'worker-loader',
    },
    {
      id: 'gate',
      label: 'Gatekeeper Worker',
      detail:
        'The only holder of the delivery key. Answers the gadget at once as if the action happened, records it, and holds it until a person approves or rejects it.',
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
    { from: 'worker', to: 'workspace', label: 'getByName' },
    { from: 'workspace', to: 'gadget', label: 'facets.get' },
    { from: 'gadget', to: 'gate', label: 'env.OUTBOX' },
    { from: 'workspace', to: 'models', label: 'turn' },
  ],
  strengths: [
    'Each gadget is its own sandbox with its own storage, so a bug in one person’s app cannot leak another’s data.',
    'The agent never waits for approval: the gatekeeper simulates the action, and a person approves or rejects the queue later.',
    'The gadget’s only binding is a gatekeeper stub already scoped to its workspace, so it cannot name another workspace.',
    'No container: the facet starts in milliseconds, and the gadget’s code can change on every call without losing data.',
  ],
  limits: [
    'One gatekeeper (a simulated outbox). Cloudflare OS ships gatekeepers for real services with OAuth.',
    'One gadget per workspace. No sharing, multiplayer, blueprints or front end.',
    'Reads of simulated actions come from the gatekeeper’s own ledger, not the real service.',
  ],
  install: {
    status: 'ready',
    plan: 'Two Workers: the gatekeeper with its ledger Durable Object and delivery key, and the workspace Worker with a Durable Object, a Worker Loader and two service bindings to the gatekeeper. One AI Gateway. Tear down deletes both Workers and the gateway.',
  },
  tools: 'in memory in the workspace; the gadget runs as a facet in a Dynamic Worker with internet off.',
  traits: {
    runsIn: 'Durable Object + facet',
    isolation: 'Facet per gadget, credential in a separate Worker',
    internet: 'off',
    state: 'DO SQLite + facet SQLite',
    startup: 'instant',
  },
  evalPlan:
    'Pi turns the starter gadget into a notes app, is restarted mid-task, resumes, adds a note and shares it by email. Pass when the note is in the facet’s storage, the email is queued in the gatekeeper and not delivered, only the gatekeeper holds the key, and a sandboxed gadget sees only its OUTBOX binding and no internet.',
  source: 'Cloudflare OS',
  links: [
    { label: 'cloudflare/cloudflare-os', href: CFOS },
    { label: 'Gadgets and Gatekeepers (README)', href: `${CFOS}#overview-what-is-cloudflare-os-really` },
    {
      label: 'Agent loop on Pi (agent.ts)',
      href: `${CFOS}/blob/main/packages/workshop-backend/src/agent.ts`,
    },
    { label: 'Gatekeeper skill', href: `${CFOS}/blob/main/.agents/skills/write-gatekeeper/SKILL.md` },
  ],
};
