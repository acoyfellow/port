import { describe, expect, it } from 'vitest';
import { softwareApprover } from '../shapes/gadget-workspace/approver.ts';
import { actionDigest, verifyAssertion } from '../shapes/gadget-workspace/gate/passkey.ts';

const action = { id: 1, workspace: 'w1', to: 'team@example.com', subject: '3 notes' };
const where = { origin: 'https://gadgets.example', rpId: 'gadgets.example' };

describe('passkey approval', () => {
  it('accepts a valid signature over the action digest', async () => {
    const approver = await softwareApprover();
    const challenge = await actionDigest(action);
    const assertion = await approver.sign(challenge, where.origin, where.rpId);
    expect(await verifyAssertion(approver.publicKey, assertion, { challenge, ...where })).toBe('');
  });

  it('refuses a signature from another key', async () => {
    const approver = await softwareApprover();
    const intruder = await softwareApprover();
    const challenge = await actionDigest(action);
    const assertion = await intruder.sign(challenge, where.origin, where.rpId);
    expect(await verifyAssertion(approver.publicKey, assertion, { challenge, ...where })).toMatch(
      /does not match/,
    );
  });

  it('refuses a signature over a different action', async () => {
    const approver = await softwareApprover();
    const other = await actionDigest({ ...action, to: 'attacker@example.com' });
    const assertion = await approver.sign(other, where.origin, where.rpId);
    expect(
      await verifyAssertion(approver.publicKey, assertion, {
        challenge: await actionDigest(action),
        ...where,
      }),
    ).toMatch(/different action/);
  });

  it('refuses a signature made for another site', async () => {
    const approver = await softwareApprover();
    const challenge = await actionDigest(action);
    const assertion = await approver.sign(challenge, 'https://evil.example', 'evil.example');
    expect(await verifyAssertion(approver.publicKey, assertion, { challenge, ...where })).toMatch(/origin/);
  });

  it('gives each action its own digest', async () => {
    expect(await actionDigest(action)).not.toBe(await actionDigest({ ...action, id: 2 }));
  });
});
