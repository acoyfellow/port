import type { Entry } from '../../shared/entry.ts';

export const SHAPE: Entry = {
  slug: 'vector-memory',
  mark: 'VM',
  name: 'Agent with long-term memory',
  oneLine:
    'The agent stores facts in Vectorize and finds them again by meaning. A new conversation can recall what an old one learned.',
  stage: 'verified',
  shape: '1 session = 1 Durable Object; long-term memory in 1 Vectorize index shared by all sessions',
  parts: [
    {
      id: 'worker',
      label: 'Session Worker',
      detail: 'Routes each session to its Durable Object.',
      product: 'worker',
    },
    {
      id: 'agent',
      label: 'Session',
      detail: 'One Durable Object per conversation, running stock Pi with remember and recall tools.',
      product: 'durable-object',
    },
    {
      id: 'memory',
      label: 'Vectorize',
      detail: 'Stores each fact as an embedding from Workers AI, with the fact text as metadata.',
      product: 'vectorize',
    },
    {
      id: 'models',
      label: 'Workers AI',
      detail: 'Kimi K2.6 for the agent, bge-base for embeddings.',
      product: 'workers-ai',
    },
  ],
  edges: [
    { from: 'worker', to: 'agent', label: 'getByName' },
    { from: 'agent', to: 'memory', label: 'upsert / query' },
    { from: 'agent', to: 'models', label: 'turn + embed' },
  ],
  strengths: [
    'Memory outlives the conversation: each session’s chat is separate, but facts are shared.',
    'Recall is by meaning, so "what database do we use" finds "the project database is D1".',
    'The chat stays small, because old facts are looked up, not kept in context.',
  ],
  limits: [
    'All sessions share one memory. There is no per-user split in this version.',
    'Nothing is ever forgotten or corrected; a wrong fact stays until it is removed by hand.',
    'New facts are not searchable at once. In the test run, Vectorize took about a minute before session B could find them.',
    'Pi decides when to store and recall, so recall depends on the model following its instructions.',
  ],
  install: {
    status: 'ready',
    plan: 'One Vectorize index, one Worker with a Durable Object, and one AI Gateway.',
  },
  tools: 'remember and recall backed by Vectorize, plus an in-memory workspace.',
  traits: {
    runsIn: 'Durable Object',
    isolation: 'One DO per conversation',
    internet: 'none',
    state: 'DO SQLite + Vectorize',
    startup: 'instant',
  },
  evalPlan:
    'Session A stores three facts and is restarted mid-task. Session B, a different Durable Object that never saw A’s chat, is asked about them. Pass when B stored nothing itself, recalled A’s facts from Vectorize, and answered with the right code name and database.',
  source: 'Vectorize',
  links: [{ label: 'Vectorize', href: 'https://developers.cloudflare.com/vectorize/' }],
};
