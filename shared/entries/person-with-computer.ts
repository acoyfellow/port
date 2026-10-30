import type { Entry } from '../entry.ts';

export const ENTRY: Entry = {
  slug: 'person-with-computer',
  mark: 'PC',
  name: 'One agent and one computer per person',
  oneLine:
    'A voice agent that runs on the signed-in user account, with one Durable Object and one container per person.',
  stage: 'outlined',
  shape: '1 person = 1 Durable Object = 1 container, with model calls on the user own Workers AI.',
  parts: [
    {
      id: 'worker',
      label: 'hark Worker',
      detail:
        'Serves the page from static assets, runs Sign in with Cloudflare, and routes the voice WebSocket.',
      product: 'worker',
    },
    {
      id: 'hark-do',
      label: 'Hark Durable Object',
      detail:
        'One per person. Holds memory, the last 24 messages, timers, MCP connections, and the voice turn loop.',
      product: 'durable-object',
    },
    {
      id: 'directory',
      label: 'Directory Durable Object',
      detail: 'SQLite table of OAuth grants: account, gateway, access token, refresh token, scope.',
      product: 'durable-object',
    },
    {
      id: 'computer',
      label: 'computer container',
      detail: 'Durable Linux container bound to the Hark class, with a file tree and a live terminal.',
      product: 'container',
    },
    {
      id: 'bench',
      label: 'Worker Loader bench',
      detail:
        'Runs model-written code in a loaded Worker with no outbound network and only a Hark bridge binding.',
      product: 'worker-loader',
    },
    {
      id: 'workers-ai',
      label: 'user Workers AI',
      detail:
        'Flux for speech to text, GPT-OSS for the brain, Aura for speech, FLUX for pictures. Called with the user token.',
      product: 'workers-ai',
    },
    {
      id: 'mcp',
      label: 'MCP servers',
      detail: 'Any MCP server the user connects by URL, with or without OAuth.',
      product: 'external',
    },
  ],
  edges: [
    { from: 'worker', to: 'hark-do', label: 'voice WebSocket' },
    { from: 'worker', to: 'directory', label: 'store grant' },
    { from: 'hark-do', to: 'directory', label: 'read token' },
    { from: 'hark-do', to: 'computer', label: 'files, terminal' },
    { from: 'hark-do', to: 'bench', label: 'run code' },
    { from: 'hark-do', to: 'workers-ai', label: 'Flux, brain, Aura' },
    { from: 'hark-do', to: 'mcp', label: 'tool calls' },
  ],
  strengths: [
    'The operator has no model bill. Every model call uses the token of the signed-in account.',
    'The token stays in a Durable Object. The browser gets only a signed cookie.',
    'Eager end of turn starts the brain early and holds the audio until Flux confirms the turn.',
    'Model-written code runs in a Worker Loader isolate with globalOutbound set to null.',
  ],
  limits: [
    'English only. One tab at a time. No wake word.',
    'It bills the user account. Flux costs money while awake, so it sleeps after two quiet minutes.',
    'It keeps only the last 24 messages as text.',
    'Deploy needs a Cloudflare OAuth client and a zone for the hostname.',
  ],
  measures: [
    {
      label: 'End of speech to first audio, p50 / p95 (Flux + GPT-OSS 20B + Aura 1, 5 runs)',
      value: '1,642 / 1,789 ms',
      source: 'receipts/bench-live-direct.json',
    },
    {
      label: 'p50 on eager end of turn (default pipeline)',
      value: '1,395 ms',
      source: 'receipts/bench-live-direct.json',
    },
    {
      label: 'Local e2e scenarios against fakes',
      value: '32/32',
      source: 'receipts/e2e-local.json',
    },
    {
      label: 'Workspace and MCP OAuth checks against fakes',
      value: 'passed',
      source: 'receipts/demo-verify.json',
    },
  ],
  install: {
    status: 'planned',
    plan: 'The repo already has alchemy.run.ts on alchemy v2 and Effect. It declares the Worker with static assets, the Hark and Directory Durable Objects, the computer Container with durable_object scheduling, and a Worker Loader binding. A port install can reuse it almost as is. Hard parts: the container image must build and push from ./computer; the user must create a Cloudflare OAuth client with the redirect URL https://HOST/oauth/callback and give its id and secret; SESSION_SECRET must be generated as a secret; HARK_DOMAIN needs a zone on the account. Without a domain the stack still deploys to workers.dev on non-prod stages.',
  },
  evalPlan:
    'swarm-5 does not fit, because hark is a voice agent, not a coding agent. A fitting eval: deploy to a test stage and run scripts/bench.mjs for end of speech to first audio, p50 and p95, per brain. Then run the e2e scenarios and the text and audio evals in the repo against the live stage, and record pass counts. Optionally give the 5 swarm-5 task prompts by voice to the bench tool and score the hidden tests, to measure code done in the Worker Loader isolate.',
  source: 'https://github.com/acoyfellow/hark',
};
