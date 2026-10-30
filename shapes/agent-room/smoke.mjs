import { getJson, prove, workerUrl } from '../lib.mjs';

const base = workerUrl('port-shape-agent-room');
const id = Date.now();
const q = `room=room-${id}&agent=agent-${id}`;

await getJson(base, `/post?${q}&sender=alice&text=hello`);
await getJson(base, `/post?${q}&sender=bob&text=plan`);
const before = await getJson(base, `/agent?${q}`);
const crash = await getJson(base, `/crash?${q}`);
const after = await getJson(base, `/agent?${q}`);
const messages = await getJson(base, `/messages?${q}`);

const senders = after.turns.map((t) => t.sender).join(',');
const roomSenders = messages.map((m) => m.sender).join(',');

prove(
  'ChatRoomDO routed 2 turns from alice and bob to a separate AgentDO, which kept both turns with their senders across a forced restart (new boot id), and the room holds 4 messages',
  crash.restarted === true &&
    before.boot !== after.boot &&
    JSON.stringify(before.turns) === JSON.stringify(after.turns) &&
    senders === 'alice,bob' &&
    roomSenders === `alice,agent:agent-${id},bob,agent:agent-${id}`,
  { before: before.boot.slice(0, 8), after: after.boot.slice(0, 8), senders, roomSenders },
);
