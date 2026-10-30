import { getJson, prove, workerUrl } from '../lib.mjs';

const base = workerUrl('port-shape-shared-container');
const result = await getJson(base, '/seats', 120);
if (result.error) throw new Error(result.error);

const users = new Set(result.agents.map((agent) => agent.user));
const uids = new Set(result.agents.map((agent) => agent.uid));
const boots = new Set(result.agents.map((agent) => agent.boot));
const denied = result.probes.filter((probe) => probe.result === 'denied').length;
const reads = result.probes.filter((probe) => probe.result === 'read').length;
const privateFiles = result.agents.every((agent) => agent.mode === '600');

prove(
  '5 agents ran as 5 distinct Unix users in one container (1 boot id), each wrote a private file, and all 20 cross-agent reads got Permission denied',
  users.size === 5 &&
    uids.size === 5 &&
    boots.size === 1 &&
    result.own === 5 &&
    privateFiles &&
    denied === 20 &&
    reads === 0 &&
    result.probes.length === 20,
  {
    users: [...users],
    uids: [...uids],
    boot: [...boots].map((boot) => boot.slice(0, 8)),
    own: result.own,
    denied,
    reads,
    host: result.host,
  },
);
