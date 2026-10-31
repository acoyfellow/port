import * as Schema from 'effect/Schema';
import { runPiSmoke } from '../kit/pi-smoke.ts';
import { client } from '../kit/smoke.ts';

const word = `kiwi${Date.now() % 10_000}`;
await client('agent-room').get(
  `/say?sender=dana&text=${encodeURIComponent(`Please post the word ${word} to the room.`)}`,
  Schema.Struct({ n: Schema.Number }),
  { tries: 120 },
);

await runPiSmoke({
  slug: 'agent-room',
  task: {
    prompt: 'Read the room and do what the newest message from a person asks.',
    passed: (_files, answer) => answer.trim() !== '',
    describe: 'read the shared room and answered a person by posting to it',
  },
  infrastructure: (probe) => ({
    ok: Number(probe.agentPosts) > 0 && String(probe.last).includes(word),
    claim: `There is no container: the room and the agent are separate Durable Objects. Pi read the room through a tool and posted "${String(probe.last).slice(0, 40)}" as agent:helper.`,
  }),
});
