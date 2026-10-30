import { prove, workerUrl } from '../lib.mjs';

const base = workerUrl('port-shape-person-with-computer');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const call = async (path, cookie = '', tries = 60) => {
  let last = '';
  for (let attempt = 0; attempt < tries; attempt++) {
    const response = await fetch(`${base}${path}`, { headers: { cookie } }).catch((error) => ({
      ok: false,
      status: String(error),
    }));
    if (response.ok) return { body: await response.json(), raw: response };
    last = String(response.status);
    await pause(2000);
  }
  throw new Error(`${path} kept failing (${last})`);
};

const stamp = Date.now();
const signin = async (person, token) => {
  const { body, raw } = await call(`/signin?p=${person}&token=${token}`);
  const cookie = (raw.headers.get('set-cookie') ?? '').split(';')[0];
  return { cookie, leaked: JSON.stringify(body).includes(token) || cookie.includes(token) };
};

const alice = await signin(`alice${stamp}`, `secret-alice-${stamp}`);
const bob = await signin(`bob${stamp}`, `secret-bob-${stamp}`);
const forged = await fetch(`${base}/look`, { headers: { cookie: `hark=bob${stamp}.00` } });

const wrote = await call(`/say?write&text=alpha`, alice.cookie);
let last = wrote.body;
for (let i = 2; i <= 30; i++) last = (await call(`/say?text=m${i}`, alice.cookie)).body;
const lookA = (await call('/look', alice.cookie)).body;
const lookB = (await call('/look', bob.cookie)).body;
await call('/stop', alice.cookie, 10);
await call('/stop', bob.cookie, 10);

const ok =
  !alice.leaked &&
  !bob.leaked &&
  forged.status === 401 &&
  last.hasToken === true &&
  last.messages === 24 &&
  last.first === 7 &&
  lookA.note === 'alpha' &&
  lookA.boot === wrote.body.box.boot &&
  lookB.note === '' &&
  lookB.boot !== lookA.boot;

prove(
  'two signed-in people each got their own Hark DO and container (alice note=alpha, bob empty, different boots); Directory kept the token server-side behind a signed cookie (forged cookie 401); 30 messages trimmed to the last 24',
  ok,
  {
    bootA: lookA.boot.slice(0, 8),
    bootB: lookB.boot.slice(0, 8),
    noteA: lookA.note,
    noteB: lookB.note,
    messages: last.messages,
    first: last.first,
    hasToken: last.hasToken,
    forged: forged.status,
    leaked: alice.leaked || bob.leaked,
  },
);
