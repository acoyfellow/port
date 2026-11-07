import type { Entry } from '../../shared/entry.ts';

export const SHAPE: Entry = {
  slug: 'beam-fleet',
  mark: 'BF',
  name: 'BEAM fleet in one container',
  oneLine:
    'Five agents share one container. A Gleam supervisor on the BEAM runs each agent’s tools as its own Unix user and restarts only the one that crashes.',
  stage: 'verified',
  shape:
    '1 agent = 1 Durable Object; 1 container holds a Gleam one_for_one supervisor with 1 tool process per agent',
  parts: [
    {
      id: 'worker',
      label: 'Fleet Worker',
      detail: 'Routes each agent to its Durable Object. Also shows the supervisor’s state at /fleet.',
      product: 'worker',
    },
    {
      id: 'seat',
      label: 'Seat',
      detail: 'One Durable Object per agent. Runs stock Pi and keeps the session in SQLite.',
      product: 'durable-object',
    },
    {
      id: 'fleet',
      label: 'Fleet container',
      detail:
        'One container. Erlang runs a Gleam static supervisor (one_for_one) with one child per seat. Each child owns an OS port that runs that seat’s tool server as Unix user agentN.',
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
    { from: 'worker', to: 'seat', label: 'getByName' },
    { from: 'seat', to: 'fleet', label: 'seat port 808N' },
    { from: 'seat', to: 'models', label: 'turn' },
  ],
  strengths: [
    'A crash or a runaway tool process stays in one seat. The supervisor restarts it, and the other seats keep working.',
    'One container for five agents, so container time is shared instead of paid five times.',
    'Each seat is its own Unix user with a private home directory, so an agent cannot read another agent’s files.',
    'The supervisor state (which seat, which process, how many starts) can be read at any time.',
  ],
  limits: [
    'A restarted seat loses the shell command that was running. Pi sees a failed tool call and runs it again.',
    'If the container itself stops, all five seats stop. The sessions survive in their Durable Objects; the files in the container do not.',
    'Agents can see each other’s process list, but not their files or environment.',
    'The container starts more slowly than a Durable Object.',
  ],
  install: {
    status: 'ready',
    plan: 'One Worker with one SQLite Durable Object class for the seats and one container class for the fleet, whose image is built from the Gleam supervisor and the Pi tool server. One AI Gateway.',
  },
  tools:
    'in one shared container; a Gleam supervisor runs one tool server per agent, each as its own Unix user.',
  traits: {
    runsIn: 'Container (BEAM supervisor)',
    isolation: 'Unix user per agent, supervised process per agent',
    internet: 'on',
    state: 'DO SQLite + container disk',
    startup: 'container',
  },
  evalPlan:
    'Three agents start the same task at once. Mid-task, the tool process of one of them is killed. Pass when the supervisor restarted only that seat, no other seat restarted, all three agents finished, the killed one resumed after a forced restart, and reading another seat’s home directory was denied.',
  source: 'gleam-agents',
  links: [
    { label: 'gleam-agents', href: 'https://gleam-agents.coey.dev/' },
    { label: 'Gleam OTP supervisors', href: 'https://hexdocs.pm/gleam_otp/gleam/otp/static_supervisor.html' },
  ],
};
