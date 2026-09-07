import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { compileContent } from './compile-content.mjs';
await test('正式构建排除全部草稿，私有预览完整保留', async () => {
  const published = await compileContent({ write: false }),
    preview = await compileContent({ preview: true, write: false });
  assert.equal(published.preview, false);
  assert(published.posts.every((p) => p.status === 'published'));
  const draftIds = preview.posts
    .filter((p) => p.status === 'draft')
    .map((p) => p.id);
  assert(draftIds.length > 0);
  for (const id of draftIds) assert(!JSON.stringify(published).includes(id));
  const originals = JSON.parse(
    await fs.readFile('content/articles/cnblogs.json', 'utf8'),
  );
  for (const old of originals) {
    const current = published.posts.find((p) => p.id === old.id);
    assert(current);
    assert.equal(current.date, old.date);
    assert.equal(current.sourceURL, old.sourceURL);
    assert.deepEqual(current.tags, old.tags);
    for (const tag of ['pre', 'table', 'img'])
      assert.equal(
        (current.html.match(new RegExp(`<${tag}\\b`, 'g')) || []).length,
        (old.html.match(new RegExp(`<${tag}\\b`, 'g')) || []).length,
      );
  }
});
await test('新 Markdown 自动进入栏目，重复 ID 被拒绝，正文剔除脚本', async () => {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'mecha-content-check-'),
  );
  try {
    await fs.mkdir(path.join(rootDir, 'content/articles'), { recursive: true });
    await fs.mkdir(path.join(rootDir, 'content/posts'), { recursive: true });
    await fs.writeFile(
      path.join(rootDir, 'content/articles/cnblogs.json'),
      '[]',
    );
    const fixture =
      '---\nid: fixture-article\nslug: fixture-article\ntitle: 测试文章\ndate: 2026-09-07\nchapter: life\nstatus: published\ntags: [测试]\nsummary: 测试内容自动收录。\n---\n## 新的章节\n正文。<script>alert(1)</script>\n';
    await fs.writeFile(path.join(rootDir, 'content/posts/new.md'), fixture);
    const result = await compileContent({ rootDir, write: false });
    assert.equal(result.posts[0].chapter, 'life');
    assert(!result.posts[0].html.includes('<script'));
    assert.equal(result.posts[0].headings.length, 1);
    await fs.writeFile(
      path.join(rootDir, 'content/posts/duplicate.md'),
      fixture,
    );
    await assert.rejects(compileContent({ rootDir, write: false }), /重复/);
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }
});
