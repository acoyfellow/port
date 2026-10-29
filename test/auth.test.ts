import { describe, expect, it } from 'vitest';
import { SCOPES as EXPLAINED } from '../shared/scopes';
import { SCOPES as REQUESTED } from '../worker/auth/oauth';
import { seal, unseal } from '../worker/auth/seal';
import { cookie, cookieJar, parseSession, sign, unsign } from '../worker/auth/session';

const KEY = '00'.repeat(32);
const OTHER_KEY = '11'.repeat(32);

describe('sealed tokens', () => {
  it('round trips with the right key', async () => {
    expect(await unseal(KEY, await seal(KEY, 'secret-token'))).toBe('secret-token');
  });

  it('does not open with another key', async () => {
    expect(await unseal(OTHER_KEY, await seal(KEY, 'secret-token'))).toBeNull();
  });

  it('does not contain the plain token', async () => {
    expect(await seal(KEY, 'secret-token')).not.toContain('secret-token');
  });
});

describe('signed cookies', () => {
  it('reject a changed payload', async () => {
    const signed = await sign('s', '{"owner":"cf:a"}');
    const [, signature] = signed.split('.');
    const forged = `${btoa('{"owner":"cf:b"}')}.${signature}`;

    expect(await unsign('s', forged)).toBeNull();
  });

  it('reject a session past its expiry', () => {
    expect(parseSession(JSON.stringify({ owner: 'cf:a', expires: 1, id: 'x' }), 2)).toBeNull();
  });

  it('use the host prefix and Secure on https', () => {
    const jar = cookieJar('https://port.customer0.dev/');

    expect(jar.session.startsWith('__Host-')).toBe(true);
    expect(cookie(jar, jar.session, 'v', 1000)).toContain('Secure');
  });
});

describe('scopes', () => {
  it('every requested scope has a reason shown to the user', () => {
    expect([...REQUESTED].sort()).toEqual(EXPLAINED.map((each) => each.scope).sort());
  });
});
