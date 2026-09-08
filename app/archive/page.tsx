import { contentSource, isPrivatePreview } from '@/lib/content/source';
import { CHAPTERS } from '@/lib/world/registry';
export const metadata = { title: '全部记录 · 徒手拆机甲' };
export default async function Archive() {
  const posts = await contentSource.list();
  return (
    <main className="reading-page archive-page">
      <header className="reading-header">
        <a href="/workbench">← 返回工作台</a>
        <a href="/about">关于</a>
      </header>
      <span className="eyebrow">THE ARCHIVE</span>
      <h1>
        所有故事，
        <br />
        都从这里翻开。
      </h1>
      {isPrivatePreview && (
        <p className="draft-notice">私有预览包含待核对草稿。</p>
      )}
      {CHAPTERS.map((c) => (
        <section className="archive-chapter" key={c.id}>
          <h2>
            {c.title}
            <small>{c.subtitle}</small>
          </h2>
          {posts
            .filter((p) => p.chapter === c.id)
            .map((p) => (
              <a className="article-item" key={p.id} href={`/posts/${p.slug}`}>
                <small>
                  {p.date}
                  {p.status === 'draft' ? ' · 草稿' : ''}
                </small>
                <h3>{p.title} ↗</h3>
                <p>{p.summary}</p>
              </a>
            ))}
          {!posts.some((p) => p.chapter === c.id) && (
            <p className="empty-message">新的记录正在整理。</p>
          )}
        </section>
      ))}
    </main>
  );
}
