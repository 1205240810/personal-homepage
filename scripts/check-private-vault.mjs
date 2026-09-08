import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin = 'http://localhost:3000';
const dir = 'content/backups/cnblogs-official-2026-09-08/';
const password = (await fs.readFile(dir + '私藏室钥匙.txt', 'utf8')).split(
  '\n',
)[2];
const originals = JSON.parse(
  await fs.readFile(dir + 'private-records.json', 'utf8'),
);
const auth = { Cookie: '__sites_local_auth=1' };
const req = (route, options = {}) => fetch(origin + route, options);
assert.equal((await req('/api/vault/records')).status, 401);
assert.equal(
  (await req('/api/vault/records/missing', { headers: auth })).status,
  401,
);
assert.equal(
  (
    await req('/api/vault/records', {
      headers: { 'oai-authenticated-user-id': 'local_seedy' },
    })
  ).status,
  401,
);
const login = (value, source = origin) =>
  req('/api/vault/session', {
    method: 'POST',
    headers: { ...auth, Origin: source, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: value }),
  });
assert.equal((await login(password, 'https://example.invalid')).status, 403);
assert.equal((await login('incorrect-password')).status, 401);
const signed = await login(password);
assert.equal(signed.status, 200);
const cookie = signed.headers.get('set-cookie');
assert(
  cookie.includes('HttpOnly') &&
    cookie.includes('SameSite=Strict') &&
    cookie.includes('Max-Age=7200'),
);
const session = cookie.split(';')[0];
const authenticated = { Cookie: auth.Cookie + '; ' + session };
const listing = await req('/api/vault/records', { headers: authenticated });
assert.equal(listing.status, 200);
assert(listing.headers.get('cache-control').includes('no-store'));
const { records } = await listing.json();
assert.equal(records.length, originals.length);
for (const record of records) {
  assert(!('html' in record));
  const response = await req('/api/vault/records/' + record.id, {
    headers: authenticated,
  });
  assert.equal(response.status, 200);
  const { article } = await response.json();
  assert(originals.some((p) => p.Title === article.title));
  assert(article.html && !article.html.includes('<script'));
}
assert.equal(
  (
    await req('/api/vault/records', {
      headers: { Cookie: auth.Cookie + '; mecha_vault_local=forged' },
    })
  ).status,
  401,
);
assert.equal(
  (await req('/api/vault/records', { headers: { Cookie: session } })).status,
  401,
);
for (const article of originals) {
  assert.equal((await req('/api/content/cnblogs-' + article.Id)).status, 404);
}
const loggedOut = await req('/api/vault/session', {
  method: 'DELETE',
  headers: { ...authenticated, Origin: origin },
});
assert.equal(loggedOut.status, 200);
assert(loggedOut.headers.get('set-cookie').includes('Max-Age=0'));
assert.equal((await req('/api/vault/records', { headers: auth })).status, 401);
console.log(
  '私藏室验证通过：本人+正确密码读取5篇；未登录、伪造身份/会话、错误密码、跨站请求和公开API均拒绝；响应不缓存。',
);
