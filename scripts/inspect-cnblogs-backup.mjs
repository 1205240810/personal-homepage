import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

// Official schema: cnblogs/vscode-cnb, BlogExportPostStore.
// Deliberately does not publish: SQLite permission is not a publication status.
const input = process.argv[2];
if (!input)
  throw new Error(
    '用法: node scripts/inspect-cnblogs-backup.mjs /path/to/official-backup.db',
  );
const bytes = await fs.readFile(input),
  hash = createHash('sha256').update(bytes).digest('hex');
if (bytes.subarray(0, 16).toString() !== 'SQLite format 3\u0000')
  throw new Error(
    '需要解压后的官方 SQLite .db 文件；JSON/XML 结构须另行核对。',
  );
const directory = path.join('content/backups', hash.slice(0, 12));
await fs.mkdir(directory, { recursive: true });
const retained = path.join(directory, 'original.db');
await fs.writeFile(retained, bytes, { flag: 'wx' }).catch((e) => {
  if (e.code !== 'EEXIST') throw e;
});
const db = new DatabaseSync(retained, { readOnly: true });
try {
  const columns = db
    .prepare('PRAGMA table_info(blog_Content)')
    .all()
    .map((c) => String(c.name));
  const required = [
    'Id',
    'Title',
    'DateAdded',
    'DateUpdated',
    'IsMarkdown',
    'AccessPermission',
    'EntryName',
    'PostType',
    'Body',
  ];
  if (!required.every((c) => columns.includes(c)))
    throw new Error(`备份 schema 不匹配，现有列: ${columns.join(', ')}`);
  const rows = db
    .prepare(
      'SELECT Id, Title, DateAdded, DateUpdated, IsMarkdown, AccessPermission, EntryName, PostType, Body FROM blog_Content',
    )
    .all();
  const existing = JSON.parse(
    await fs.readFile('content/articles/cnblogs.json', 'utf8'),
  );
  const review = [];
  let excluded = 0;
  for (const row of rows) {
    if (
      !['BlogPost', 'Article'].includes(String(row.PostType)) ||
      Number(row.AccessPermission) !== 0
    ) {
      excluded++;
      continue;
    }
    const old = existing.find((p) => p.id === `cnblogs-${row.Id}`);
    review.push({
      id: `cnblogs-${row.Id}`,
      title: row.Title,
      originalDateAdded: row.DateAdded,
      originalDateUpdated: row.DateUpdated,
      sourceURL: `https://www.cnblogs.com/tscjj/p/${row.Id}.html`,
      sourceFormat: row.IsMarkdown ? 'markdown' : 'html',
      body: row.Body,
      existingSlug: old?.slug ?? null,
      existingTags: old?.tags ?? null,
      existingStatus: old?.status ?? null,
      requiresReview: old
        ? ['核对正文与更新日期']
        : ['确认已发表', '核对原标签', '选择稳定 slug', '整理摘要'],
      suggestedStatus: old?.status ?? 'draft',
    });
  }
  await fs.writeFile(
    path.join(directory, 'review.json'),
    JSON.stringify(review, null, 2),
  );
  const report = {
    sha256: hash,
    table: 'blog_Content',
    totalRows: rows.length,
    reviewRows: review.length,
    excludedPrivateOrOther: excluded,
    existingIds: review.filter((r) => r.existingSlug).map((r) => r.id),
    unconfirmed: review.filter((r) => !r.existingSlug).length,
    limitations: [
      '该 SQLite schema 不提供可靠的已发表标记与标签。AccessPermission=0 不能替代发布状态。',
      '没有修改站点文章；必须核对 review.json 后才合并。',
    ],
  };
  await fs.writeFile(
    path.join(directory, 'report.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(
    `备份已保留。${review.length} 篇待核对；${excluded} 项私人或其他记录未提取正文。查看 ${directory}/report.json。站点未改变。`,
  );
} finally {
  db.close();
}
