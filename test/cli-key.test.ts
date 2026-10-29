import { describe, expect, it } from 'vitest';
import { currentUser, mintCliKey, usesCliKey } from '../worker/auth/routes';
import { sign } from '../worker/auth/session';

const env = (cliSecret: string) => ({ SESSION_SECRET: 'session-secret', CLI_KEY_SECRET: cliSecret });

const withKey = (key: string) =>
  new Request('https://port.customer0.dev/installs/json', { headers: { authorization: `Bearer ${key}` } });

describe('CLI keys', () => {
  it('act as the user who made them', async () => {
    const key = await mintCliKey(env('cli-secret'), 'cf:alice');

    expect(usesCliKey(withKey(key))).toBe(true);
    expect(await currentUser(env('cli-secret'), withKey(key))).toBe('cf:alice');
  });

  it('do not work with another secret', async () => {
    const key = await mintCliKey(env('cli-secret'), 'cf:alice');

    expect(await currentUser(env('other-secret'), withKey(key))).toBeNull();
  });

  it('stop working after they expire', async () => {
    const expired = `portcli.${await sign('cli-secret', JSON.stringify({ owner: 'cf:alice', expires: 1, id: 'x' }))}`;

    expect(await currentUser(env('cli-secret'), withKey(expired))).toBeNull();
  });

  it('cannot be made from a browser session cookie', async () => {
    const sessionSigned = await sign(
      'session-secret',
      JSON.stringify({ owner: 'cf:alice', expires: Date.now() + 60_000, id: 'x' }),
    );

    expect(await currentUser(env('cli-secret'), withKey(`portcli.${sessionSigned}`))).toBeNull();
  });

  it('are not read from other bearer tokens', () => {
    expect(usesCliKey(withKey('some-cloudflare-token'))).toBe(false);
  });
});
