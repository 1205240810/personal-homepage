import fs from 'node:fs/promises';
import path from 'node:path';
import {
  randomBytes,
  createHash,
  createCipheriv,
  pbkdf2Sync,
  createHmac,
} from 'node:crypto';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const input = process.argv[2];
if (!input || !path.resolve(input).includes('/content/backups/'))
  throw new Error('输入必须位于已忽略的 content/backups');
const original = JSON.parse(await fs.readFile(input, 'utf8'));
const publicPosts = JSON.parse(
  await fs.readFile('content/articles/cnblogs.json', 'utf8'),
);
if (
  original.some((p) =>
    publicPosts.some((q) => String(p.Id) === String(q.sourceId)),
  )
)
  throw new Error('私文与公开ID重复，停止处理');
const records = await Promise.all(
  original.map(async (p) => {
    const raw = p.IsMarkdown ? await marked(p.Body) : p.Body;
    if (/<(?:img|video|audio|iframe|object)\b/i.test(raw))
      throw new Error('私文含媒体，需要先配置私密媒体导入');
    const sourceURL =
      p.SourceUrl || `https://www.cnblogs.com/tscjj/p/${p.Id}.html`;
    return {
      id: createHash('sha256')
        .update(`mecha-private:${p.Id}`)
        .digest('hex')
        .slice(0, 24),
      title: p.Title,
      date: p.DateAdded.slice(0, 10),
      updatedAt: p.DateUpdated,
      sourceURL,
      sourcePermission: p.AccessPermission,
      html: sanitizeHtml(raw, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat([
          'h1',
          'h2',
          'del',
        ]),
        allowedAttributes: {
          '*': ['id', 'class'],
          a: ['href', 'target', 'rel'],
          td: ['colspan', 'rowspan'],
          th: ['colspan', 'rowspan'],
        },
        allowedSchemes: ['http', 'https', 'mailto'],
        transformTags: {
          a: (tag, attrs) => ({
            tagName: tag,
            attribs: {
              ...attrs,
              ...(attrs.href
                ? { href: new URL(attrs.href, sourceURL).href }
                : {}),
              rel: 'noreferrer noopener',
              target: '_blank',
            },
          }),
        },
      }),
    };
  }),
);
const password = randomBytes(24).toString('base64url');
const b64 = () => randomBytes(32).toString('base64');
const secret = {
  dataKey: b64(),
  sessionKey: b64(),
  pepper: b64(),
  salt: randomBytes(16).toString('base64'),
  passwordHash: '',
};
const material = createHmac('sha256', Buffer.from(secret.pepper, 'base64'))
  .update(password)
  .digest('base64');
secret.passwordHash = pbkdf2Sync(
  material,
  Buffer.from(secret.salt, 'base64'),
  100000,
  32,
  'sha256',
).toString('base64');
const iv = randomBytes(12),
  cipher = createCipheriv(
    'aes-256-gcm',
    Buffer.from(secret.dataKey, 'base64'),
    iv,
  );
cipher.setAAD(Buffer.from('mecha-private-vault-v1'));
const ciphertext = Buffer.concat([
  cipher.update(JSON.stringify(records)),
  cipher.final(),
  cipher.getAuthTag(),
]);
await fs.mkdir('lib/private-vault', { recursive: true });
await fs.writeFile(
  'lib/private-vault/archive.encrypted.json',
  JSON.stringify({
    version: 1,
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }),
);
const dir = path.dirname(input);
await fs.writeFile(
  path.join(dir, 'vault-secret.json'),
  JSON.stringify(secret),
  { mode: 0o600 },
);
await fs.writeFile(
  path.join(dir, '私藏室钥匙.txt'),
  `机甲私藏室独立密码\n\n${password}\n\n入口：旧纸库左侧书柜后的窄门，或 /vault。\n仅本人 ChatGPT 账号可用；不会修改博客园密码。请妥善保存此文件。\n`,
  { mode: 0o600 },
);
await fs.writeFile(
  '.dev.vars',
  `MECHA_VAULT_SECRET='${JSON.stringify(secret)}'\nMECHA_VAULT_OWNER_ID="local_seedy"\n`,
  { mode: 0o600 },
);
await fs.writeFile(
  path.join(dir, 'sealed-records-review.json'),
  JSON.stringify(records, null, 2),
  { mode: 0o600 },
);
console.log(
  `已加密${records.length}篇私藏记录。密钥与密码仅保存在被忽略的本地备份中。`,
);
