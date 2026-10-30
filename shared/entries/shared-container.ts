import type { Entry } from '../entry.ts';

export const ENTRY: Entry = {
  slug: 'shared-container',
  mark: 'SC',
  name: 'Shared container, one user per agent',
  oneLine: 'Five coding agents share one container. Each agent runs as its own Unix user.',
  stage: 'outlined',
  shape: '1 container = 5 agents = 5 Unix users',
  parts: [
    {
      id: 'runner',
      label: 'Run script',
      detail: 'Starts 5 seats at once, one per hidden-test goal, and collects receipts.',
      product: 'external',
    },
    {
      id: 'container',
      label: 'Fleet container',
      detail: 'Erlang Alpine image with pi, gh, cf, Chromium and skills. Runs as user fleet.',
      product: 'container',
    },
    {
      id: 'seat-user',
      label: 'seat-user claim/release',
      detail:
        'Under a flock, adds a seat-* user, gives it the work and agent dirs with mode 700, then returns them to fleet.',
      product: 'container',
    },
    {
      id: 'seats',
      label: '5 Pi seats',
      detail: 'One Pi agent per seat. Each seat runs through sudo as its own user (uid 1001-1005).',
      product: 'container',
    },
    {
      id: 'model',
      label: 'Model provider',
      detail: 'LLM calls for each seat. Tokens are written to events.jsonl per seat.',
      product: 'external',
    },
    {
      id: 'grader',
      label: 'Hidden tests',
      detail: 'Grades each seat workspace after the run.',
      product: 'external',
    },
  ],
  edges: [
    { from: 'runner', to: 'container', label: 'start' },
    { from: 'container', to: 'seat-user', label: 'claim' },
    { from: 'seat-user', to: 'seats', label: 'sudo -u seat-*' },
    { from: 'seats', to: 'model', label: 'turns' },
    { from: 'seats', to: 'grader', label: 'workspace' },
    { from: 'grader', to: 'runner', label: 'receipt' },
  ],
  strengths: [
    'Five agents share one container, so one image and one boot serve all seats.',
    'Unix users isolate seats: 0 cross-seat reads in 15 probes, with 260 denials.',
    'Each seat has full tools: gh, cf, Chromium, pi and three skills.',
  ],
  limits: [
    'Mean cost was 0.593 USD per seat, over the 0.2252 USD limit, so the claim is disproven.',
    'Concurrent adduser once gave two seats the same uid and leaked a session. A flock fixed it.',
    'max_turns is not enforced by run-seat, so seats ran up to 35 turns.',
    'Proven only in local Docker on a 4-CPU laptop VM, one run per attempt.',
  ],
  measures: [
    { label: 'Hidden tests passed', value: '4/5', source: 'proof/swarm-5/DISPROVEN.json' },
    {
      label: 'Cross-seat reads',
      value: '0 in 15 probes, 260 denials',
      source: 'proof/swarm-5/DISPROVEN.json',
    },
    { label: 'Mean USD per seat', value: '0.593', source: 'proof/swarm-5/DISPROVEN.json' },
    { label: 'Turns per seat', value: '14-35', source: 'proof/swarm-5/DISPROVEN.json' },
  ],
  install: {
    status: 'planned',
    plan: 'An Alchemy v2 (Effect v4) project would build fleet-image/Dockerfile and deploy it as a Cloudflare Container behind a Worker and a Durable Object that starts the run. The image must include seat-user.sh and the sudoers file. The model API key must be a Worker secret passed to the container. Hard parts: the container (image size with Chromium and Erlang, sudo and adduser inside it) and secrets. gh and cf sign-in need a user token or OAuth app; that was not tested.',
  },
  evalPlan:
    'Port runs the swarm-5 eval as is: 5 goals (business-days, cart-merge, csv-parse, money-words, sku-glob) in one container, one seat user each, graded by hidden tests. It measures pass count, turns and USD per seat from events.jsonl, and runs isolation-probe.sh to count cross-seat reads and denials. Run it more than once to get a noise band.',
  source: 'gleam-agents: proof/swarm-5, fleet-image, harness/pi',
};
