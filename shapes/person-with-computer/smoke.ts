import * as Schema from 'effect/Schema';
import { client, prove } from '../kit/smoke.ts';

const SignedIn = Schema.Struct({ signedIn: Schema.Boolean, cookie: Schema.String });
const Box = Schema.Struct({ boot: Schema.String });
const Said = Schema.Struct({
  hasToken: Schema.Boolean,
  messages: Schema.Number,
  first: Schema.Number,
  box: Schema.NullOr(Box),
});
const Look = Schema.Struct({ boot: Schema.String, note: Schema.String });
const Stopped = Schema.Struct({ stopped: Schema.Boolean });

const stamp = Date.now();

const signin = async (person: string, token: string) => {
  const body = await client('person-with-computer').get(`/signin?p=${person}&token=${token}`, SignedIn, {
    tries: 60,
  });
  return { cookie: body.cookie, leaked: JSON.stringify(body).includes(token) };
};

const alice = await signin(`alice${stamp}`, `secret-alice-${stamp}`);
const bob = await signin(`bob${stamp}`, `secret-bob-${stamp}`);
const forged = await client('person-with-computer', { bearer: `bob${stamp}.00` })
  .get('/look', Look, { tries: 1 })
  .then(
    () => 'accepted',
    (error: unknown) => String(error),
  );

const aliceApi = client('person-with-computer', { bearer: alice.cookie });
const bobApi = client('person-with-computer', { bearer: bob.cookie });
await aliceApi.get('/look', Look, { tries: 60 });
const wrote = await aliceApi.get('/say?write&text=alpha', Said, { tries: 1 });
let last = wrote;
for (let i = 2; i <= 30; i++) last = await aliceApi.get(`/say?text=m${i}`, Said);
const lookA = await aliceApi.get('/look', Look, { tries: 60 });
const lookB = await bobApi.get('/look', Look, { tries: 60 });
await aliceApi.get('/stop', Stopped, { tries: 10 });
await bobApi.get('/stop', Stopped, { tries: 10 });

const ok =
  !alice.leaked &&
  !bob.leaked &&
  forged.includes('HTTP 401') &&
  last.hasToken &&
  last.messages === 24 &&
  last.first === 7 &&
  lookA.note === 'alpha' &&
  lookA.boot === wrote.box?.boot &&
  lookB.note === '' &&
  lookB.boot !== lookA.boot;

prove(
  'Two signed-in people each got their own Hark Durable Object and container. Alice saw her note alpha. Bob saw an empty note. The two boot IDs were different. Directory kept the token on the server. The client got only a signed cookie. A forged cookie got 401. The Hark object trimmed 30 messages to the last 24.',
  ok,
  {
    bootA: lookA.boot.slice(0, 8),
    bootB: lookB.boot.slice(0, 8),
    noteA: lookA.note,
    noteB: lookB.note,
    messages: last.messages,
    first: last.first,
    hasToken: last.hasToken,
    forged,
    leaked: alice.leaked || bob.leaked,
  },
);
