/// <reference types="vite/client" />
import 'server-only';
import { env } from 'cloudflare:workers';
import { archive } from './archive';
import {
  bytes,
  equal,
  passwordHash,
  sessionValue,
  unbase64,
  validSession,
} from './crypto';
import type { VaultSecret } from './crypto';
import type { PrivateRecord } from './types';

const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  Vary: 'Cookie, oai-authenticated-user-id',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};
export const vaultResponse = (
  data: unknown,
  status = 200,
  extra: Record<string, string> = {},
) => Response.json(data, { status, headers: { ...headers, ...extra } });
function settings() {
  if (!archive) return null;
  const runtime = env as unknown as Record<string, string | undefined>;
  try {
    const secret = JSON.parse(runtime.MECHA_VAULT_SECRET || '') as VaultSecret;
    if (
      !['dataKey', 'sessionKey', 'pepper', 'salt', 'passwordHash'].every(
        (k) => typeof secret[k as keyof VaultSecret] === 'string',
      )
    )
      return null;
    return { secret, owner: runtime.MECHA_VAULT_OWNER_ID || '' };
  } catch {
    return null;
  }
}
function ownerCheck(request: Request) {
  const url = new URL(request.url);
  if (
    url.protocol !== 'https:' &&
    !(
      import.meta.env.DEV &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    )
  )
    return {
      error: vaultResponse({ error: '请通过安全连接打开私藏室。' }, 403),
    };
  const config = settings();
  if (!config?.owner)
    return { error: vaultResponse({ error: '私藏室正在准备中。' }, 503) };
  const current = request.headers.get('oai-authenticated-user-id');
  if (!current)
    return {
      error: vaultResponse({ error: '请先登录主人的 ChatGPT 账号。' }, 401),
    };
  if (!equal(current, config.owner))
    return { error: vaultResponse({ error: '这间房只对主人开放。' }, 403) };
  return { config };
}
const cookieName = (request: Request) =>
  new URL(request.url).protocol === 'https:'
    ? '__Host-mecha_vault'
    : 'mecha_vault_local';
function cookie(request: Request, value: string, age: number) {
  const secure = new URL(request.url).protocol === 'https:';
  return `${cookieName(request)}=${encodeURIComponent(value)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure ? '; Secure' : ''}`;
}
function token(request: Request) {
  const value = request.headers
    .get('cookie')
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookieName(request) + '='))
    ?.split('=')
    .slice(1)
    .join('=');
  try {
    return decodeURIComponent(value || '');
  } catch {
    return '';
  }
}
function sameOrigin(request: Request) {
  return request.headers.get('origin') === new URL(request.url).origin;
}
export async function vaultGuard(request: Request) {
  const checked = ownerCheck(request);
  if (checked.error) return checked.error;
  if (
    !(await validSession(
      token(request),
      checked.config!.owner,
      checked.config!.secret,
    ))
  )
    return vaultResponse({ error: '请用私藏室密码开门。' }, 401);
  return null;
}
export async function vaultStatus(request: Request) {
  const checked = ownerCheck(request);
  if (checked.error) return checked.error;
  const value = token(request);
  const authenticated = await validSession(
    value,
    checked.config!.owner,
    checked.config!.secret,
  );
  return vaultResponse({
    authenticated,
    ...(authenticated
      ? {
          expiresAt: JSON.parse(
            new TextDecoder().decode(unbase64(value.split('.')[0])),
          ).expires,
        }
      : {}),
  });
}
// The platform owner allowlist is the hard boundary. This per-isolate throttle only buffers accidental repeated attempts.
const attempts = new Map<string, { count: number; expires: number }>();
export async function unlockVault(request: Request) {
  const checked = ownerCheck(request);
  if (checked.error) return checked.error;
  if (!sameOrigin(request))
    return vaultResponse({ error: '请从本站打开私藏室。' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    return vaultResponse({ error: '请求格式不正确。' }, 400);
  const { owner, secret } = checked.config!;
  const now = Date.now();
  let entry = attempts.get(owner);
  if (!entry || entry.expires <= now) {
    entry = { count: 0, expires: now + 600000 };
    attempts.set(owner, entry);
  }
  if (++entry.count > 8)
    return vaultResponse({ error: '试得有些频繁，请稍后再试。' }, 429, {
      'Retry-After': '600',
    });
  try {
    const reader = request.body?.getReader();
    if (!reader) return vaultResponse({ error: '请输入密码。' }, 400);
    let body = '',
      length = 0;
    const decoder = new TextDecoder();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 2048) {
        await reader.cancel();
        return vaultResponse({ error: '请求过长。' }, 413);
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    const { password } = JSON.parse(body);
    if (
      typeof password !== 'string' ||
      password.length < 1 ||
      password.length > 256
    )
      return vaultResponse({ error: '请输入密码。' }, 400);
    if (
      !equal(
        await passwordHash(password, secret.salt, secret.pepper),
        secret.passwordHash,
      )
    )
      return vaultResponse({ error: '密码不对，再想一想。' }, 401);
    attempts.delete(owner);
    const issuedAt = Date.now(),
      value = await sessionValue(owner, secret, issuedAt);
    return vaultResponse(
      { authenticated: true, expiresAt: issuedAt + 7200000 },
      200,
      { 'Set-Cookie': cookie(request, value, 7200) },
    );
  } catch {
    return vaultResponse({ error: '无法开门，请检查输入。' }, 400);
  }
}
export async function lockVault(request: Request) {
  if (!sameOrigin(request))
    return vaultResponse({ error: '请求来源不正确。' }, 403);
  return vaultResponse({ authenticated: false }, 200, {
    'Set-Cookie': cookie(request, '', 0),
  });
}
export function bootstrapIdentity(request: Request) {
  if (!archive) return vaultResponse({ error: '不存在' }, 404);
  // Enabled only during root's owner-private deployment handoff; it cannot unlock or return records.
  if (
    (env as unknown as Record<string, string | undefined>).MECHA_VAULT_OWNER_ID
  )
    return vaultResponse({ error: '不存在' }, 404);
  const ownerId = request.headers.get('oai-authenticated-user-id');
  return ownerId
    ? vaultResponse({ ownerId })
    : vaultResponse({ error: '需要登录' }, 401);
}
let decoded: Promise<PrivateRecord[]> | undefined;
async function records() {
  const config = settings();
  if (!config?.owner || !archive) throw new Error('Private archive unavailable');
  const encrypted = archive;
  decoded ??= (async () => {
    const key = await crypto.subtle.importKey(
      'raw',
      unbase64(config.secret.dataKey),
      'AES-GCM',
      false,
      ['decrypt'],
    );
    const data = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: unbase64(encrypted.iv),
        additionalData: bytes('mecha-private-vault-v1'),
      },
      key,
      unbase64(encrypted.ciphertext),
    );
    return JSON.parse(new TextDecoder().decode(data)) as PrivateRecord[];
  })();
  return decoded;
}
export async function privateRecords(request: Request, id?: string) {
  const denied = await vaultGuard(request);
  if (denied) return denied;
  try {
    const all = await records();
    if (!id)
      return vaultResponse({
        records: all
          .map(({ html, sourceURL, sourcePermission, ...summary }) => summary)
          .sort((a, b) => b.date.localeCompare(a.date)),
      });
    const article = all.find((r) => r.id === id);
    return article
      ? vaultResponse({ article })
      : vaultResponse({ error: '这页记录不存在。' }, 404);
  } catch {
    return vaultResponse({ error: '记录暂时无法打开。' }, 503);
  }
}
