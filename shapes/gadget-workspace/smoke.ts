import { runPiSmoke } from '../kit/pi-smoke.ts';
import type { Client } from '../kit/smoke.ts';
import { softwareApprover } from './approver.ts';

const note = `buy milk ${Date.now() % 10_000}`;
const recipient = 'team@example.com';

type Challenge = { readonly challenge?: string; readonly origin: string; readonly rpId: string };
type Action = { readonly id: number; readonly status: string };

const field = (value: unknown, key: string) =>
  typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;

const isChallenge = (value: unknown): value is Challenge =>
  typeof field(value, 'origin') === 'string' && typeof field(value, 'rpId') === 'string';

const isActions = (value: unknown): value is Action[] =>
  Array.isArray(value) && value.every((each) => typeof field(each, 'id') === 'number');

const approvals = async (api: Client, agent: string) => {
  const listed = await api.raw('GET', `/approvals?agent=${agent}`);
  if (!isActions(listed.json)) throw new Error(`approvals list failed: ${JSON.stringify(listed.json)}`);
  const pending = listed.json.filter((action) => action.status === 'pending');
  const [first, second] = pending;
  if (first === undefined) return { approvalError: 'no pending action to approve' };
  const approver = await softwareApprover();
  const intruder = await softwareApprover();
  await api.raw('POST', `/approvals/enroll?agent=${agent}`, JSON.stringify(approver.publicKey));
  const secondEnroll = await api.raw(
    'POST',
    `/approvals/enroll?agent=${agent}`,
    JSON.stringify(intruder.publicKey),
  );
  const challengeReply = await api.raw('GET', `/approvals/challenge?agent=${agent}&id=${first.id}`);
  if (!isChallenge(challengeReply.json) || challengeReply.json.challenge === undefined)
    return { approvalError: `no challenge: ${JSON.stringify(challengeReply.json)}` };
  const { challenge, origin, rpId } = challengeReply.json;
  const approve = async (body: unknown) =>
    (await api.raw('POST', `/approvals/approve?agent=${agent}&id=${first.id}`, JSON.stringify(body))).json;
  const unsigned = await approve({});
  const forged = await approve(await intruder.sign(challenge, origin, rpId));
  const wrongDigest = await approve(await approver.sign(`${challenge.slice(0, -2)}AA`, origin, rpId));
  const signed = await approve(await approver.sign(challenge, origin, rpId));
  const replay = await approve(await approver.sign(challenge, origin, rpId));
  const otherAction =
    second === undefined
      ? undefined
      : (
          await api.raw(
            'POST',
            `/approvals/approve?agent=${agent}&id=${second.id}`,
            JSON.stringify(await approver.sign(challenge, origin, rpId)),
          )
        ).json;
  const after = await api.raw('GET', `/approvals?agent=${agent}`);
  const finalStatus = isActions(after.json)
    ? after.json.find((action) => action.id === first.id)?.status
    : undefined;
  return {
    unsignedRefused: typeof field(unsigned, 'refused') === 'string',
    forgedRefused: typeof field(forged, 'refused') === 'string',
    wrongDigestRefused: typeof field(wrongDigest, 'refused') === 'string',
    signedDelivered: field(signed, 'delivered') === first.id && finalStatus === 'delivered',
    replayRefused: typeof field(replay, 'refused') === 'string',
    secondEnrollRefused: typeof field(secondEnroll.json, 'refused') === 'string',
    otherActionRefused:
      otherAction === undefined ? 'no second action' : typeof field(otherAction, 'refused') === 'string',
    refusals: [unsigned, forged, wrongDigest, replay]
      .map((reply) => String(field(reply, 'refused')))
      .join(' | '),
  };
};

await runPiSmoke({
  slug: 'gadget-workspace',
  restartAfterMs: 8000,
  task: {
    prompt: `Turn the gadget into a notes app. POST /add with JSON {"text": "..."} stores a note in SQLite. GET /list returns JSON {"notes": [...]} with every note text. POST /share emails the note count to the address in JSON {"to": "..."} through this.env.OUTBOX.send(to, "N notes") and returns what OUTBOX answered. Then use call_gadget to add the note "${note}", list the notes, and share to ${recipient}.`,
    passed: (files) => (files['gadget/server.js'] ?? '').includes('OUTBOX'),
    describe:
      'built a notes gadget in a facet, shared a note through the gatekeeper, and the email was delivered only after a valid passkey signature',
  },
  afterTask: approvals,
  infrastructure: (probe) => {
    const list = String(probe.list ?? '');
    const internet = String(probe.sandboxInternet ?? '');
    const bindings = String(probe.sandboxBindings ?? '');
    const ok =
      list.includes(note) &&
      String(probe.recipients ?? '').includes(recipient) &&
      probe.gateHoldsKey === true &&
      probe.workspaceHasKey === false &&
      internet.startsWith('blocked') &&
      bindings === 'OUTBOX' &&
      probe.unsignedRefused === true &&
      probe.forgedRefused === true &&
      probe.wrongDigestRefused === true &&
      probe.replayRefused === true &&
      probe.secondEnrollRefused === true &&
      probe.signedDelivered === true;
    return {
      ok,
      claim: `The gadget ran as a Durable Object facet and kept "${note}" in its own storage. Its email went to the gatekeeper and waited. The gatekeeper refused an unsigned approval, a signature from another key, a signature over a different action, a second enrollment and a replay (${String(probe.refusals)}); it delivered the email only for a valid P-256 passkey signature over that action's digest. Only the gatekeeper holds the delivery key. A sandboxed gadget saw bindings [${bindings}] and no internet.`,
    };
  },
});
