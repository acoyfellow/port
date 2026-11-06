import { webcrypto } from 'node:crypto';
import type { ApproverKey, Assertion } from './gate/passkey.ts';
import { toBase64Url } from './gate/passkey.ts';

const subtle = webcrypto.subtle;
const encoder = new TextEncoder();

const rawToDer = (raw: Uint8Array) => {
  const integer = (bytes: Uint8Array) => {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start++;
    const trimmed = bytes.slice(start);
    const value = (trimmed[0] ?? 0) & 0x80 ? Uint8Array.of(0, ...trimmed) : trimmed;
    return Uint8Array.of(0x02, value.length, ...value);
  };
  const r = integer(raw.slice(0, 32));
  const s = integer(raw.slice(32));
  return Uint8Array.of(0x30, r.length + s.length, ...r, ...s);
};

export type SoftwareApprover = {
  readonly publicKey: ApproverKey;
  readonly sign: (challenge: string, origin: string, rpId: string) => Promise<Assertion>;
};

export const softwareApprover = async (): Promise<SoftwareApprover> => {
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await subtle.exportKey('jwk', pair.publicKey);
  if (jwk.x === undefined || jwk.y === undefined) throw new Error('P-256 key export failed');
  return {
    publicKey: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y },
    sign: async (challenge, origin, rpId) => {
      const clientData = encoder.encode(JSON.stringify({ type: 'webauthn.get', challenge, origin }));
      const rpHash = new Uint8Array(await subtle.digest('SHA-256', encoder.encode(rpId)));
      const authenticatorData = Uint8Array.of(...rpHash, 0x05, 0, 0, 0, 1);
      const clientHash = new Uint8Array(await subtle.digest('SHA-256', clientData));
      const raw = new Uint8Array(
        await subtle.sign(
          { name: 'ECDSA', hash: 'SHA-256' },
          pair.privateKey,
          Uint8Array.of(...authenticatorData, ...clientHash),
        ),
      );
      return {
        authenticatorData: toBase64Url(authenticatorData),
        clientDataJSON: toBase64Url(clientData),
        signature: toBase64Url(rawToDer(raw)),
      };
    },
  };
};
