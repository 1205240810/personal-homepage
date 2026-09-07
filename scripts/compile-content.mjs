import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
export async function compileContent({
  preview = false,
  write = true,
  rootDir = process.cwd(),
} = {}) {
  const root = rootDir;
  const imported = JSON.parse(
    await fs.readFile(path.join(root, 'content/articles/cnblogs.json'), 'utf8'),
  );
  const drafts = [];
  for (const dir of ['content/posts', 'content/drafts']) {
    for (const file of await fs.readdir(path.join(root, dir)).catch(() => [])) {
      if (!file.endsWith('.md')) continue;
      const { data, content } = matter(
        await fs.readFile(path.join(root, dir, file), 'utf8'),
      );
      drafts.push({
        ...data,
        date: String(
          data.date instanceof Date
            ? data.date.toISOString().slice(0, 10)
            : data.date,
        ),
        html: await marked(content),
        format: 'markdown',
      });
    }
  }
  const all = [...imported, ...drafts];
  const seen = new Set(),
    slugs = new Set();
  for (const p of all) {
    if (
      !p.id ||
      !p.slug ||
      !p.title ||
      !p.date ||
      !p.chapter ||
      !p.status ||
      !p.summary ||
      !Array.isArray(p.tags)
    )
      throw new Error(`文章缺少必要字段: ${p.id || p.title}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date) || Number.isNaN(Date.parse(p.date)))
      throw new Error(`无效文章日期: ${p.id}`);
    if (
      !p.tags.every((t) => typeof t === 'string') ||
      typeof p.summary !== 'string' ||
      typeof p.html !== 'string'
    )
      throw new Error(`无效文章字段: ${p.id}`);
    if (seen.has(p.id) || slugs.has(p.slug))
      throw new Error(`重复内容 ID 或地址: ${p.id}`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug))
      throw new Error(`不合法的文章地址: ${p.slug}`);
    if (!['undergraduate', 'graduate', 'life'].includes(p.chapter))
      throw new Error(`未知章节: ${p.chapter}`);
    if (!['published', 'draft'].includes(p.status))
      throw new Error(`未知发布状态: ${p.status}`);
    seen.add(p.id);
    slugs.add(p.slug);
  }
  const links = new Map(
    all
      .filter((p) => p.status === 'published' || preview)
      .filter((p) => p.sourceURL)
      .map((p) => [p.sourceURL, `/posts/${p.slug}`]),
  );
  const posts = all
    .filter((p) => p.status === 'published' || preview)
    .map((p) => {
      const headings = [];
      let headingIndex = 0;
      const html = sanitizeHtml(p.html, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat([
          'img',
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'del',
          'sup',
          'sub',
        ]),
        allowedAttributes: {
          '*': ['id', 'class'],
          a: ['href', 'target', 'rel'],
          img: ['src', 'alt', 'width', 'height', 'loading'],
          td: ['colspan', 'rowspan'],
          th: ['colspan', 'rowspan'],
        },
        allowedSchemes: ['http', 'https', 'mailto'],
        transformTags: {
          a: (tag, attrs) => ({
            tagName: 'a',
            attribs: {
              ...attrs,
              href: links.get(attrs.href) || attrs.href,
              rel: 'noopener noreferrer',
            },
          }),
        },
      }).replace(
        /<h([1-6])([^>]*)>([\s\S]*?)<\/h\1>/g,
        (_, level, attrs, title) => {
          const match = attrs.match(/\bid="([^"]*)"/);
          const id = match?.[1] || `section-${headingIndex++}`;
          headings.push({
            id,
            title: title.replace(/<[^>]+>/g, ''),
            level: Number(level),
          });
          return `<h${level}${match ? attrs : `${attrs} id="${id}"`}>${title}</h${level}>`;
        },
      );
      return {
        ...p,
        html,
        headings,
        readingMinutes: Math.max(
          1,
          Math.ceil(html.replace(/<[^>]+>/g, '').length / 600),
        ),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  const output = { preview, posts };
  if (write) {
    await fs.mkdir(path.join(root, 'lib/content'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'lib/content/generated.json'),
      JSON.stringify(output),
    );
  }
  return output;
}
if (process.argv[1]?.endsWith('compile-content.mjs')) {
  const result = await compileContent({
    preview: process.env.CONTENT_PREVIEW === '1',
  });
  console.log(
    `内容检查通过：${result.posts.length} 篇，${result.preview ? '私有草稿预览' : '仅正式文章'}`,
  );
}
