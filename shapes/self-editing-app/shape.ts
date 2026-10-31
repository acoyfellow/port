import type { Entry } from '../../shared/entry.ts';

export const SHAPE: Entry = {
  slug: 'self-editing-app',
  mark: 'SE',
  name: 'App the agent rewrites',
  oneLine:
    'An agent rewrites a web app for one user. A new version goes live only if it builds, boots and passes checks.',
  stage: 'verified',
  shape: '1 user = 1 Durable Object = 1 live app version in a Worker Loader isolate',
  parts: [
    {
      id: 'kernel',
      label: 'Kernel Worker',
      detail: 'Fixed Worker. It holds sign-in, routing, the gate, and rollback. The agent cannot edit it.',
      product: 'worker',
    },
    {
      id: 'agent',
      label: 'Agent DO',
      detail:
        'One SQLite Durable Object per user and conversation. It runs the Pi agent and commits each turn.',
      product: 'durable-object',
    },
    {
      id: 'body',
      label: 'Body DO',
      detail:
        'One SQLite Durable Object per user. It holds the draft, every version, the live pointer, and app data.',
      product: 'durable-object',
    },
    {
      id: 'builder',
      label: 'Builder DO',
      detail:
        'One Durable Object per build part. It installs npm packages, bundles server and client, and compiles Tailwind.',
      product: 'durable-object',
    },
    {
      id: 'loader',
      label: 'Gate and runtime',
      detail:
        'Worker Loader isolate with no network and no secrets. It boots the server and runs the body checks.',
      product: 'worker-loader',
    },
    {
      id: 'directory',
      label: 'Directory DO',
      detail: 'One shared Durable Object that records events and stats per user.',
      product: 'durable-object',
    },
    {
      id: 'model',
      label: 'Model',
      detail:
        'Workers AI or the user AI Gateway on the signed-in user account, with the user token. No AI binding.',
      product: 'external',
    },
  ],
  edges: [
    { from: 'kernel', to: 'agent', label: 'chat' },
    { from: 'agent', to: 'model', label: 'model call' },
    { from: 'agent', to: 'body', label: 'write_file, ship' },
    { from: 'body', to: 'builder', label: 'build version' },
    { from: 'body', to: 'loader', label: 'boot and check' },
    { from: 'kernel', to: 'loader', label: 'serve live version' },
    { from: 'body', to: 'directory', label: 'record event' },
  ],
  strengths: [
    'The kernel never changes at runtime, so a bad version cannot remove the way back.',
    'A version goes live only after it bundles, boots, and passes its own checks.',
    'A browser crash guard makes the last good version live again without the user.',
    'Model calls run on the signed-in user account and token, not on the deployer bill.',
  ],
  limits: [
    'Each build bundles with esbuild-wasm and takes about 10 s of CPU, so the Worker needs a high cpu_ms limit.',
    'The agent edits only the app body. It has no container, shell, or general computer.',
    'Sign-in needs a Cloudflare OAuth client, and users must grant account access for model calls.',
  ],
  install: {
    status: 'planned',
    plan: 'An Alchemy v2 (Effect v4) project would create one Worker with nodejs_compat and enable_ctx_exports, a Worker Loader binding, a version metadata binding, and four SQLite Durable Object classes: Agent, Body, Builder, Directory. It sets MODEL and a cpu_ms limit of 300000. It bundles the kernel assets and the seed body source. The hard part is the Cloudflare OAuth app: the user must register a client and set its ID and secret, and set the redirect URL to the route. No containers. No AI binding is needed because users bring their own account.',
  },
  tools:
    'in memory in the Durable Object, plus a ship_app tool that boots the new app version in a fresh Worker Loader isolate and makes it live only if its check passes.',
  traits: {
    runsIn: 'Durable Object + isolates',
    isolation: 'Isolate per app version',
    internet: 'off',
    state: 'DO SQLite',
    startup: 'instant',
  },
  evalPlan:
    'swarm-5 does not fit directly, because the agent edits only its own app body. A fitting eval gives the agent 5 app change requests with hidden story tests placed in the body checks. Port measures how many versions pass the gate on the first ship, ship attempts per task, build and gate time per version, rollbacks, and model tokens. The repo e2e suite (npm run e2e) is a ready baseline for gate correctness.',
  source: 'https://github.com/acoyfellow/skin',
};
