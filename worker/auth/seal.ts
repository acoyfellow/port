const encoder = new TextEncoder();
const decoder = new TextDecoder();

const keyFrom = async (hexKey: string) => {
  const bytes = new Uint8Array((hexKey.match(/.{2}/gu) ?? []).map((pair) => Number.parseInt(pair, 16)));

  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const fromBase64 = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

export const seal = async (hexKey: string, plain: string): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await keyFrom(hexKey),
    encoder.encode(plain),
  );

  return `${toBase64(iv)}.${toBase64(new Uint8Array(cipher))}`;
};

export const unseal = async (hexKey: string, sealed: string): Promise<string | null> => {
  const [ivText, cipherText] = sealed.split('.');

  if (ivText === undefined || cipherText === undefined) return null;

  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(ivText) },
      await keyFrom(hexKey),
      fromBase64(cipherText),
    );

    return decoder.decode(plain);
  } catch {
    return null;
  }
};
