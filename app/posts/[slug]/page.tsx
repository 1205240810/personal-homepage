import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { contentSource } from '@/lib/content/source';
import { ArticleView } from '@/components/world/archive-reader';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const d = await contentSource.get((await params).slug);
  return {
    title:
      d?.kind === 'article' ? `${d.article.title} · 徒手拆机甲` : '档案未找到',
  };
}
export default async function Post({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const d = await contentSource.get((await params).slug);
  if (!d || d.kind !== 'article') notFound();
  return (
    <main className="reading-page">
      <header className="reading-header">
        <a href="/">← 返回首页</a>
        <a href="/archive">全部记录</a>
      </header>
      <ArticleView article={d.article} />
    </main>
  );
}
