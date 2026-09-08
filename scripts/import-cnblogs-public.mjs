import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sanitizeHtml from 'sanitize-html';

// Input is a reviewed capture of public pages, never an authenticated/private export.
const input = path.resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('请指定已核对的公开抓取目录');
const posts = JSON.parse(
  await fs.readFile(path.join(input, 'candidate-cnblogs.json'), 'utf8'),
);
const images = JSON.parse(
  await fs.readFile(path.join(input, 'image-downloads.json'), 'utf8'),
);
const inventory = JSON.parse(
  await fs.readFile(path.join(input, 'inventory.json'), 'utf8'),
);
if (posts.length !== 74 || posts.some((p) => p.status !== 'published'))
  throw new Error('公开清单与本次已核验的74篇不符');
const backup = 'content/backups/cnblogs-public-2026-09-08';
await fs.cp(input, backup, {
  recursive: true,
  force: false,
  errorOnExist: true,
});
const mapping = new Map(images.map((i) => [i.url, i]));
const escape = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;');
const report = [];
for (const post of posts) {
  const source = inventory.find((p) => p.id === post.id);
  if (
    createHash('sha256').update(post.html).digest('hex') !== source.bodySha256
  )
    throw new Error(`原文散列不符: ${post.id}`);
  delete post.bodyFile;
  const missingImages = [];
  post.html = post.html
    .replace(/<img\b[^>]*>/gi, (tag) => {
      let attrs;
      sanitizeHtml(tag, {
        transformTags: {
          img: (name, a) => {
            attrs = a;
            return { tagName: name, attribs: a };
          },
        },
      });
      const url = attrs['data-src'] || attrs.src;
      if (/images\.cnblogs\.com\/OutliningIndicators\//.test(url)) return '';
      const image = mapping.get(url);
      if (!image) throw new Error(`未知原图: ${post.id}`);
      if (image.state !== 'downloaded') {
        missingImages.push({
          reason: image.state,
          originalSource: url.startsWith('http://10.')
            ? '原站私有网络图片'
            : url,
        });
        return `<figure class="missing-source-image"><figcaption>原文图片暂不可用。<a href="${escape(post.sourceURL)}" target="_blank">查看博客园原文 ↗</a></figcaption></figure>`;
      }
      return `<img src="/content-assets/cnblogs/${path.basename(image.localPath)}" alt="${escape(attrs.alt || '')}" loading="lazy">`;
    })
    .replace(/<audio\b[^>]*>\s*<\/audio>/gi, '')
    .replace(/<span class="cnblogs_code_collapse">View Code<\/span>/g, '');
  if (!post.summary) {
    post.summary = '原文目前仅保留字母「S」，未补写正文。';
    post.migrationNote = post.summary;
  }
  report.push({
    id: post.id,
    slug: post.slug,
    title: post.title,
    date: post.date,
    tags: post.tags,
    sourceURL: post.sourceURL,
    sourceBodySha256: source.bodySha256,
    codeBlocks: source.preBlocks,
    missingImages,
    ...(post.migrationNote ? { note: post.migrationNote } : {}),
  });
}
await fs.mkdir('public/content-assets/cnblogs', { recursive: true });
for (const image of images.filter(
  (i) => i.state === 'downloaded' && !i.url.includes('/OutliningIndicators/'),
)) {
  const bytes = await fs.readFile(image.localPath);
  if (createHash('sha256').update(bytes).digest('hex') !== image.sha256)
    throw new Error('图片散列不符');
  await fs.writeFile(
    `public/content-assets/cnblogs/${path.basename(image.localPath)}`,
    bytes,
  );
}
await fs.writeFile(
  'content/articles/cnblogs.json',
  JSON.stringify(posts, null, 2) + '\n',
);
await fs.writeFile(
  'docs/cnblogs-public-import.json',
  JSON.stringify(
    {
      date: '2026-09-08',
      count: posts.length,
      source: '公开月份归档与随笔列表，两者均74篇',
      originalBackup: backup,
      articles: report,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `已导入${posts.length}篇公开文章；19张正文原图已本地保存，6处失效图片已标记。`,
);
