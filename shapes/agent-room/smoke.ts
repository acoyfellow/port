import * as Schema from 'effect/Schema';
import { client, prove } from '../kit/smoke.ts';

const Turn = Schema.Struct({
  n: Schema.Number,
  room: Schema.String,
  sender: Schema.String,
  text: Schema.String,
  reply: Schema.String,
});
const Agent = Schema.Struct({ boot: Schema.String, turns: Schema.Array(Turn) });
const Message = Schema.Struct({ n: Schema.Number, sender: Schema.String, text: Schema.String });
const Messages = Schema.Array(Message);
const Crash = Schema.Struct({ restarted: Schema.Boolean });

const api = client('agent-room');
const id = Date.now();
const q = `room=room-${id}&agent=agent-${id}`;

await api.get(`/post?${q}&sender=alice&text=hello`, Turn);
await api.get(`/post?${q}&sender=bob&text=plan`, Turn);
const before = await api.get(`/agent?${q}`, Agent);
const crash = await api.get(`/crash?${q}`, Crash);
const after = await api.get(`/agent?${q}`, Agent);
const messages = await api.get(`/messages?${q}`, Messages);

const senders = after.turns.map((t) => t.sender).join(',');
const roomSenders = messages.map((m) => m.sender).join(',');

prove(
  'ChatRoomDO sent 2 turns from alice and bob to a separate AgentDO. The AgentDO kept both turns and their senders after a forced restart. The boot ID changed. The room holds 4 messages.',
  crash.restarted &&
    before.boot !== after.boot &&
    JSON.stringify(before.turns) === JSON.stringify(after.turns) &&
    senders === 'alice,bob' &&
    roomSenders === `alice,agent:agent-${id},bob,agent:agent-${id}`,
  { before: before.boot.slice(0, 8), after: after.boot.slice(0, 8), senders, roomSenders },
);
