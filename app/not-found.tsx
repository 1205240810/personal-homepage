export default function NotFound() {
  return (
    <main className="reading-page">
      <span className="eyebrow">档案未找到</span>
      <h1>这一页，还没有归档。</h1>
      <p>记录可能尚未发布，或地址已经变化。</p>
      <a className="quiet-link" href="/archive">
        返回文章目录 →
      </a>
    </main>
  );
}
