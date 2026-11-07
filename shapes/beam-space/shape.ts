import type { Entry } from '../../shared/entry.ts';

export const SHAPE: Entry = {
  slug: 'beam-space',
  mark: 'SP',
  name: 'Space with a coordinator agent',
  oneLine:
    'You talk to one coordinator. It splits the job into worker threads, starts a checker thread for each, and keeps a summary. Every thread is a supervised process on the BEAM.',
  stage: 'verified',
  shape:
    '1 space = 1 coordinator Durable Object with no file tools; 1 thread = 1 Pi Durable Object; thread tools run under a Gleam supervisor in 1 container',
  parts: [
    {
      id: 'worker',
      label: 'Space Worker',
      detail: 'Routes each space to its coordinator. Also shows the supervisor’s state at /fleet.',
      product: 'worker',
    },
    {
      id: 'space',
      label: 'Space',
      detail:
        'One Durable Object per space. Runs stock Pi with no file tools, only tools to start, message and read threads, adopt a checked result into the shared files, and save the summary. The thread list is a table, so starting a name twice does nothing.',
      product: 'durable-object',
    },
    {
      id: 'thread',
      label: 'Thread',
      detail: 'One Durable Object per thread. Runs stock Pi and keeps its session in SQLite.',
      product: 'durable-object',
    },
    {
      id: 'fleet',
      label: 'Fleet container',
      detail:
        'One container with a Gleam one_for_one supervisor. Each thread’s tools run in a supervised process as its own Unix user.',
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
    { from: 'worker', to: 'space', label: 'getByName' },
    { from: 'space', to: 'thread', label: 'start / message / read' },
    { from: 'thread', to: 'fleet', label: 'seat port 808N' },
    { from: 'space', to: 'models', label: 'turn' },
    { from: 'thread', to: 'models', label: 'turn' },
  ],
  strengths: [
    'You give one job to one agent. It creates and tracks the threads, so you do not.',
    'Every worker’s result is checked by a different thread before it is adopted.',
    'The thread list is stored in the coordinator’s SQLite. After a restart the coordinator sees what it already started and does not start it again.',
    'Threads share one container, and a crash in one thread’s tools restarts only that thread’s process.',
  ],
  limits: [
    'The coordinator cannot run code. It only knows what the threads report and the files they wrote.',
    'Up to five threads share the container’s five seats, so two threads can share a seat and its Unix user. They still work in different folders.',
    'A coordinated job costs more model time than the same job done by one agent, because the coordinator and every checker also read and write.',
    'No people in the loop yet: one person talks to the space. Several people and comments are not built.',
  ],
  install: {
    status: 'ready',
    plan: 'One Worker with two SQLite Durable Object classes (Space, Thread) and one container class for the fleet, built from the Gleam supervisor and the Pi tool server. One AI Gateway.',
  },
  tools:
    'the coordinator has no file tools; each thread has a workspace in the shared container under a Gleam supervisor, as its own Unix user.',
  traits: {
    runsIn: 'Durable Objects + container (BEAM supervisor)',
    isolation: 'Thread per task, Unix user per seat',
    internet: 'on',
    state: 'DO SQLite + container disk',
    startup: 'container',
  },
  evalPlan:
    'The coordinator gets one job with three parts and is restarted mid-job. Pass when it started at least three worker threads and three checker threads, started no thread twice, adopted the checked files, and saved a summary. In the coding eval it gets each task and must run it through a worker and a checker.',
  source: 'Amp Spaces',
  links: [
    { label: 'Amp: Spaces', href: 'https://ampcode.com/news/spaces' },
    { label: 'gleam-agents', href: 'https://gleam-agents.coey.dev/' },
  ],
};
