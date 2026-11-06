export type Assertion = {
  readonly authenticatorData: string;
  readonly clientDataJSON: string;
  readonly signature: string;
};

export type ApproverKey = {
  readonly kty: 'EC';
  readonly crv: 'P-256';
  readonly x: string;
  readonly y: string;
};

export type ActionFields = {
  readonly id: number;
  readonly workspace: string;
  readonly to: string;
  readonly subject: string;
};

const encoder = new TextEncoder();

export const fromBase64Url = (text: string) => {
  const padded = text
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(text.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};

export const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');

const sha256 = async (bytes: Uint8Array) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes)));

export const actionDigest = async (action: ActionFields) =>
  toBase64Url(
    await sha256(
      encoder.encode(
        JSON.stringify(['port-approve-v1', action.workspace, action.id, action.to, action.subject]),
      ),
    ),
  );

const unsignedInteger = (bytes: Uint8Array) => {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) start++;
  const trimmed = bytes.slice(start);
  if (trimmed.length > 32) return undefined;
  const out = new Uint8Array(32);
  out.set(trimmed, 32 - trimmed.length);
  return out;
};

export const derToRaw = (der: Uint8Array) => {
  if (der[0] !== 0x30) return undefined;
  let offset = 2;
  const parts: Uint8Array[] = [];
  for (let index = 0; index < 2; index++) {
    if (der[offset] !== 0x02) return undefined;
    const length = der[offset + 1] ?? 0;
    const value = unsignedInteger(der.slice(offset + 2, offset + 2 + length));
    if (value === undefined) return undefined;
    parts.push(value);
    offset += 2 + length;
  }
  const [r, s] = parts;
  if (r === undefined || s === undefined) return undefined;
  const raw = new Uint8Array(64);
  raw.set(r, 0);
  raw.set(s, 32);
  return raw;
};

const sameBytes = (left: Uint8Array, right: Uint8Array) =>
  left.length === right.length && left.every((byte, index) => byte === right[index]);

const USER_PRESENT = 0x01;

export const verifyAssertion = async (
  key: ApproverKey,
  assertion: Assertion,
  expected: { readonly challenge: string; readonly origin: string; readonly rpId: string },
): Promise<string> => {
  const clientBytes = fromBase64Url(assertion.clientDataJSON);
  const client: unknown = JSON.parse(new TextDecoder().decode(clientBytes));
  if (Reflect.get(Object(client), 'type') !== 'webauthn.get') return 'not a WebAuthn assertion';
  if (Reflect.get(Object(client), 'challenge') !== expected.challenge)
    return 'the signature is for a different action';
  if (Reflect.get(Object(client), 'origin') !== expected.origin) return 'wrong origin';
  const authenticatorData = fromBase64Url(assertion.authenticatorData);
  if (!sameBytes(authenticatorData.slice(0, 32), await sha256(encoder.encode(expected.rpId))))
    return 'wrong relying party';
  if (((authenticatorData[32] ?? 0) & USER_PRESENT) === 0) return 'no user presence';
  const raw = derToRaw(fromBase64Url(assertion.signature));
  if (raw === undefined) return 'malformed signature';
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    { ...key, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  const signed = new Uint8Array(authenticatorData.length + 32);
  signed.set(authenticatorData, 0);
  signed.set(await sha256(clientBytes), authenticatorData.length);
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    Uint8Array.from(raw),
    signed,
  );
  return valid ? '' : 'the signature does not match the approver key';
};
