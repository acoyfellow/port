import type { Entry } from '../entry.ts';

export const ENTRY: Entry = {
  slug: 'chat-ax',
  mark: 'B',
  name: 'Chat AX',
  oneLine: 'A shared chat room where a team and a tree of AI agents work together on one Cloudflare account.',
  stage: 'outlined',
  shape: '1 room = 1 ChatRoom Durable Object, 1 agent = 1 Agent Durable Object, no containers.',
  parts: [
    {
      id: 'worker',
      label: 'Worker + /mcp',
      detail: 'Serves the chat UI and the same actions as an MCP server at /mcp.',
      product: 'worker',
    },
    {
      id: 'access',
      label: 'Cloudflare Access',
      detail: 'Only allowed emails or domains get in. The Worker refuses everyone until Access is set.',
      product: 'access',
    },
    {
      id: 'room',
      label: 'ChatRoomDO',
      detail: 'One SQLite Durable Object per room. Holds messages and the turn queue.',
      product: 'durable-object',
    },
    {
      id: 'agent',
      label: 'AgentDO',
      detail:
        'One SQLite Durable Object per agent. Stores each turn as it runs so a reply resumes after restart.',
      product: 'durable-object',
    },
    {
      id: 'vault',
      label: 'ConnectorVaultDO',
      detail: 'Holds each person\u2019s own MCP connectors. A connector runs only as its owner.',
      product: 'durable-object',
    },
    {
      id: 'ai',
      label: 'Workers AI',
      detail: 'Default model. No API key to paste.',
      product: 'workers-ai',
    },
    {
      id: 'files',
      label: 'R2 files',
      detail: 'One bucket for agent files.',
      product: 'r2',
    },
  ],
  edges: [
    { from: 'access', to: 'worker', label: 'verified identity' },
    { from: 'worker', to: 'room', label: 'messages' },
    { from: 'room', to: 'agent', label: 'turns' },
    { from: 'agent', to: 'ai', label: 'model calls' },
    { from: 'agent', to: 'vault', label: 'connector call as sender' },
    { from: 'agent', to: 'files' },
  ],
  strengths: [
    'Runs on the Workers free plan with only Durable Objects, R2 and Workers AI.',
    'Each turn carries the verified sender. Use of another person\u2019s connector needs a one-time approval.',
    'Replies survive a runtime restart because turns are stored in Durable Object SQLite.',
    'Agents can have child agents. Each child is the same kind of room.',
  ],
  limits: [
    'No container or sandbox. Agents cannot run arbitrary shell code.',
    'Setup must create an Access application. A deploy button alone leaves the URL open, so the README says not to use one.',
    'Tools come only from MCP connectors that each person adds.',
    'Differs from my-ax: my-ax is one user with containers, sandboxes, Browser Rendering, Worker Loader and D1. chat-ax is many people in one room with Durable Objects only.',
  ],
  measures: [
    {
      label: 'Cross-account attacks held in security boundary run',
      value: '30 of 30',
      source: 'receipts/security-boundary.json',
    },
    {
      label: 'Security check suites passed',
      value: '11 of 11',
      source: 'receipts/security.json',
    },
  ],
  install: {
    status: 'planned',
    plan: 'An Alchemy v2 (Effect v4) project creates one Worker, three SQLite Durable Object classes (ChatRoomDO, ConnectorVaultDO, AgentDO) with one migration, a Workers AI binding and one R2 bucket. The hard part is Cloudflare Access: it must create an Access application and policy for the allowed emails, then write the Access team and audience values onto the Worker. Without them the Worker refuses all requests. No containers and no OAuth apps are needed. Connector tokens are added by each user at run time, not at install.',
  },
  evalPlan:
    'swarm-5 does not fit well because chat-ax has no shell or container to run hidden tests. A fitting eval: drive the /mcp endpoint with two test accounts, create an agent, send turns from both, and replay the security boundary attacks. Measure attacks held, turns that resume after a forced restart, and time to first streamed token on Workers AI.',
  source: 'https://github.com/acoyfellow/chat-ax',
};
