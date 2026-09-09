'use client';
import { useEffect, useRef } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { Article } from '@/lib/content/source';

export function ArticleBody({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let canceled = false;
    import('katex/contrib/auto-render').then(({ default: renderMath }) => {
      if (!canceled && ref.current)
        renderMath(ref.current, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '\\[', right: '\\]', display: true },
            { left: '\\(', right: '\\)', display: false },
          ],
          throwOnError: false,
          ignoredTags: [
            'script',
            'noscript',
            'style',
            'textarea',
            'pre',
            'code',
          ],
          trust: false,
        });
    });
    return () => {
      canceled = true;
    };
  }, [html]);
  return (
    <div
      ref={ref}
      className="prose-archive"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
export function ArticleView({
  article,
  embedded = false,
}: {
  article: Article;
  embedded?: boolean;
}) {
  return (
    <article className="reading-article">
      <div className="reading-meta">
        <span>
          {article.chapter === 'undergraduate'
            ? '场景基础'
            : article.chapter === 'graduate'
              ? '交互笔记'
              : '设计复盘'}
        </span>
        <span>
          {article.date} · {article.readingMinutes} 分钟
        </span>
      </div>
      <h1>{article.title}</h1>
      <p className="reading-summary">{article.summary}</p>
      {article.status === 'draft' && (
        <p className="draft-notice">编辑草稿 · 等待本人核对，尚未公开发布。</p>
      )}
      <div className="reading-tags">
        {article.tags.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      {article.headings.length > 2 && (
        <details className="reading-toc">
          <summary>文章目录 · {article.headings.length} 节</summary>
          <nav>
            {article.headings.map((h) => (
              <a
                key={h.id}
                href={`#${h.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  document.getElementById(h.id)?.scrollIntoView({ block: 'start' });
                }}
                style={{ paddingLeft: Math.max(0, h.level - 2) * 12 }}
              >
                {h.title}
              </a>
            ))}
          </nav>
        </details>
      )}
      <ArticleBody html={article.html} />
      <footer className="article-source">
        {article.sourceURL && (
          <a href={article.sourceURL} target="_blank" rel="noreferrer">
            阅读博客园原文 <ArrowUpRight size={13} />
          </a>
        )}
        {embedded && (
          <a href={`#/posts/${article.slug}`}>
            独立阅读页面 <ArrowUpRight size={13} />
          </a>
        )}
        <span>林间小院 · 交互主页学习案例</span>
      </footer>
    </article>
  );
}
export { ProfileView } from './learning-profile';
