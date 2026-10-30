import * as Schema from 'effect/Schema';
import { client, prove } from '../kit/smoke.ts';

const Agent = Schema.Struct({
  user: Schema.String,
  uid: Schema.Number,
  boot: Schema.String,
  mode: Schema.String,
});
const Probe = Schema.Struct({ from: Schema.String, to: Schema.String, result: Schema.String });
const Seats = Schema.Struct({
  run: Schema.String,
  host: Schema.String,
  own: Schema.Number,
  agents: Schema.Array(Agent),
  probes: Schema.Array(Probe),
});

const api = client('shared-container');
const result = await api.get('/seats', Seats, { tries: 120 });

const users = new Set(result.agents.map((agent) => agent.user));
const uids = new Set(result.agents.map((agent) => agent.uid));
const boots = new Set(result.agents.map((agent) => agent.boot));
const denied = result.probes.filter((probe) => probe.result === 'denied').length;
const reads = result.probes.filter((probe) => probe.result === 'read').length;
const privateFiles = result.agents.every((agent) => agent.mode === '600');

prove(
  '5 agents ran as 5 different Unix users in one container. The container had 1 boot ID. Each agent wrote a private file. All 20 cross-agent reads got Permission denied.',
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
