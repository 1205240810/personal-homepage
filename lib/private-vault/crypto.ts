export const bytes = (text: string) => new TextEncoder().encode(text);
export const base64 = (value: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(value)));
export const unbase64 = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
export async function hmac(key: string, message: string) {
  const k = await crypto.subtle.importKey(
    'raw',
    unbase64(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64(await crypto.subtle.sign('HMAC', k, bytes(message)));
}
export function equal(a: string, b: string) {
  const x = bytes(a),
    y = bytes(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++)
    diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}
export async function passwordHash(
  password: string,
  salt: string,
  pepper: string,
) {
  const material = await hmac(pepper, password);
  const key = await crypto.subtle.importKey(
    'raw',
    bytes(material),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  return base64(
    await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: unbase64(salt),
        iterations: 100000,
      },
      key,
      256,
    ),
  );
}
export type VaultSecret = {
  dataKey: string;
  sessionKey: string;
  pepper: string;
  salt: string;
  passwordHash: string;
};
export async function sessionValue(
  owner: string,
  secret: VaultSecret,
  now = Date.now(),
) {
  const payload = base64(
    bytes(
      JSON.stringify({
        owner,
        expires: now + 7200000,
        nonce: base64(crypto.getRandomValues(new Uint8Array(16))),
      }),
    ),
  );
  return payload + '.' + (await hmac(secret.sessionKey, payload));
}
export async function validSession(
  token: string,
  owner: string,
  secret: VaultSecret,
  now = Date.now(),
) {
  try {
    const parts = token.split('.');
    if (
      parts.length !== 2 ||
      token.length > 1024 ||
      !equal(parts[1], await hmac(secret.sessionKey, parts[0]))
    )
      return false;
    const data = JSON.parse(new TextDecoder().decode(unbase64(parts[0])));
    return (
      data.owner === owner &&
      typeof data.expires === 'number' &&
      data.expires > now &&
      data.expires <= now + 7200000
    );
  } catch {
    return false;
  }
}
