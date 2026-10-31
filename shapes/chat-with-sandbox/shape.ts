import type { Entry } from '../../shared/entry.ts';

export const SHAPE: Entry = {
  slug: 'chat-with-sandbox',
  mark: 'CS',
  name: 'Durable chat with a sandbox',
  oneLine: 'One operator chats with a Pi agent. Each chat has a Durable Object and a container workspace.',
  stage: 'verified',
  shape: '1 chat = 1 Durable Object = 1 sandbox container',
  parts: [
    {
      id: 'worker',
      label: 'Worker',
      detail: 'Checks the Access identity, routes chats, runs a 5-minute cron.',
      product: 'worker',
    },
    {
      id: 'access',
      label: 'Access login',
      detail: 'One verified identity owns every chat, record, and tool call.',
      product: 'access',
    },
    {
      id: 'pi-chat',
      label: 'PiChatAgent',
      detail:
        'One Durable Object per owner and chat id. The Pi durable harness keeps the transcript in DO storage.',
      product: 'durable-object',
    },
    {
      id: 'sandbox',
      label: 'Sandbox container',
      detail: 'Per-chat Linux workspace at /home/user. Snapshots go to R2.',
      product: 'container',
    },
    {
      id: 'models',
      label: 'Workers AI',
      detail: 'Default model @cf/zai-org/glm-5.3. A gateway model is used when one is set.',
      product: 'workers-ai',
    },
    {
      id: 'd1',
      label: 'D1',
      detail: 'Session status, jobs, and history.',
      product: 'd1',
    },
    {
      id: 'r2',
      label: 'R2',
      detail: 'Home snapshots and user uploads.',
      product: 'r2',
    },
  ],
  edges: [
    { from: 'access', to: 'worker', label: 'identity' },
    { from: 'worker', to: 'pi-chat', label: 'getAgentByName' },
    { from: 'pi-chat', to: 'models', label: 'turn' },
    { from: 'pi-chat', to: 'sandbox', label: 'exec, files' },
    { from: 'pi-chat', to: 'd1', label: 'run status' },
    { from: 'sandbox', to: 'r2', label: 'snapshot' },
  ],
  strengths: [
    'Each chat has its own Durable Object and its own workspace, so chats do not share state.',
    'The harness state lives in DO storage, so the object can stop between turns and wake on the next message.',
    'Exec timeout defaults to 120 s with a 600 s cap. Tool output is clipped at 30,000 characters.',
    'A turn watchdog checks progress every 60 s and marks stuck turns.',
  ],
  limits: [
    'Single operator only. It is not built for many users.',
    'The repo has many DO classes and two container classes, so the full shape is large to copy.',
    'Delegated children get no MCP, browser, machine, or delegation tools.',
    'Local checks do not prove Access, containers, or models. The repo says a deployed proof is needed.',
  ],
  install: {
    status: 'planned',
    plan: 'An Alchemy v2 (Effect v4) project would create one Worker with static assets, a cron trigger, and these bindings: Workers AI, Browser, Worker Loader, D1, KV, two R2 buckets, and the Durable Object classes with SQLite migrations. PiChatAgent and Sandbox are the minimum for box B. Hard parts: the Sandbox container image must build and push from the Dockerfile. The Access application and its AUD and issuer values must exist before the Worker accepts traffic. An optional model gateway URL and its token are secrets. The OAuth client Durable Object needs an OAuth app for each MCP connector.',
  },
  tools:
    'in the chat’s own sandbox container with internet off, through the same forwarded Node tool environment.',
  traits: {
    runsIn: 'Container per chat',
    isolation: 'Container per chat',
    internet: 'off',
    state: 'DO SQLite + disk',
    startup: 'container',
  },
  evalPlan:
    'Port could open one Pi chat per swarm-5 task, send the task prompt over the chat route, and let the agent work in its Sandbox workspace. After the turn ends, port copies the hidden tests into /home/user, runs them with exec, and records pass or fail. It would measure tasks passed out of 5, wall time per turn, cold wake time of the Durable Object and container, and model tokens per task.',
  source: 'https://github.com/acoyfellow/my-ax',
};
