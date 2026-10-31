import * as Schema from 'effect/Schema';
import { fileTask, runPiSmoke } from '../kit/pi-smoke.ts';
import { client } from '../kit/smoke.ts';

const SignedIn = Schema.Struct({ signedIn: Schema.Boolean, cookie: Schema.String, held: Schema.Boolean });
const stamp = Date.now();
const token = `secret-${stamp}`;
const signin = await client('person-with-computer').get(`/signin?p=alice-${stamp}&token=${token}`, SignedIn, {
  tries: 120,
});
const forged = await client('person-with-computer', { bearer: `alice-${stamp}.00` }).raw(
  'GET',
  '/status?agent=x',
);

await runPiSmoke({
  slug: 'person-with-computer',
  task: fileTask,
  bearer: signin.cookie,
  infrastructure: (probe) => ({
    ok:
      signin.held &&
      !signin.cookie.includes(token) &&
      forged.status === 401 &&
      typeof probe.boot === 'string' &&
      probe.boot.length > 0,
    claim: `The agent ran as the signed-in person in their own computer (boot ${String(probe.boot).slice(0, 8)}). The token stayed in the Directory Durable Object; the browser got only a signed cookie, and a forged cookie got HTTP ${forged.status}.`,
  }),
});
