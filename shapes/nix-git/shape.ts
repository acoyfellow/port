import type { Entry } from '../../shared/entry.ts';

export const SHAPE: Entry = {
  slug: 'nix-git',
  mark: 'NG',
  name: 'Container with a git that cannot force-push',
  oneLine:
    'The agent’s container is built with Nix around a patched git. A force push is not a rule the agent can turn off: the code for it is not in the binary.',
  stage: 'verified',
  shape: '1 session = 1 agent = 1 container built by Nix; git patched at build time',
  parts: [
    {
      id: 'worker',
      label: 'Shape Worker',
      detail: 'Routes each session to its Durable Object.',
      product: 'worker',
    },
    {
      id: 'box',
      label: 'Session DO',
      detail: 'One SQLite Durable Object per session. Runs stock Pi and owns the container.',
      product: 'durable-object',
    },
    {
      id: 'container',
      label: 'Nix-built container',
      detail:
        'A single-layer image from a Nix flake: Node, Python, ripgrep and a git with one patch to remote.c. Every tool path is a fixed Nix store path.',
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
    { from: 'worker', to: 'box', label: 'getByName' },
    { from: 'box', to: 'container', label: 'tool calls' },
    { from: 'box', to: 'models', label: 'turn' },
  ],
  strengths: [
    'Six forms of force push fail: --force, -f, --force-with-lease, a +refspec, a +refspec in config and --mirror. A normal push still works.',
    'The agent cannot get around it with a flag, a config value or a hook, because the force path is not compiled in.',
    'The image is built from a pinned flake, so the same input gives the same git, down to the store path.',
  ],
  limits: [
    'Only git is changed. The agent can still delete files, or push to a host that has no branch protection with another tool, such as curl to the forge API.',
    'The first build compiles git from source. On this builder it took tens of minutes; later builds come from the Nix store.',
    'Cloudflare cannot prepare multi-layer Nix images today, so the image is one layer and shares nothing with other images.',
    'The container has internet access.',
  ],
  install: {
    status: 'ready',
    plan: 'One Worker with one SQLite Durable Object class that is also a container class. The image is built from shapes/kit/box/flake.nix and pushed to the Cloudflare registry. One AI Gateway.',
  },
  tools:
    'in this session’s own container, built by Nix. The git on its PATH is the patched Nix build; the probe checks the store path.',
  traits: {
    runsIn: 'Durable Object + container (Nix image)',
    isolation: 'Container per session, git without force push',
    internet: 'on',
    state: 'DO SQLite + container disk',
    startup: 'container',
  },
  evalPlan:
    'The probe makes a bare remote, pushes once, rewrites history and tries all six force-push forms. Pass when all six are refused, the remote branch did not move, a normal push worked and git is the Nix store path. Then the same five coding tasks as every shape.',
  source: 'nix-cf-proof',
  links: [{ label: 'nix-cf-proof', href: 'https://github.com/acoyfellow/nix-cf-proof' }],
};
