'use client';
import { useEffect, useRef } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { Article } from '@/lib/content/source';
import profile from '@/content/data/profile.json';
import awards from '@/content/data/awards.json';

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
            { left: '$', right: '$', display: false },
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
            ? '本科旧文'
            : article.chapter === 'graduate'
              ? '研究生札记'
              : '生活杂谈'}
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
          <a href={`/posts/${article.slug}`}>
            独立阅读页面 <ArrowUpRight size={13} />
          </a>
        )}
        <span>徒手拆机甲 · 留下一份记录</span>
      </footer>
    </article>
  );
}
export function ProfileView({
  section = 'profile',
  onArticle,
}: {
  section?: string;
  onArticle?: (id: string) => void;
}) {
  return (
    <div className="profile-view">
      {section === 'profile' && (
        <>
          <span className="eyebrow">A NOTE FROM THE OWNER</span>
          <h2>
            徒手拆机甲<span>徒手拆机甲</span>
          </h2>
          <p className="profile-intro">
            这里放着本科时写下的算法笔记、研究生阶段的学习记录，以及代码之外的一些生活。你可以从任意一个舱口开始，慢慢走，随意读。
          </p>
          <a
            className="quiet-link"
            href={profile.blogURL}
            target="_blank"
            rel="noreferrer"
          >
            博客园旧址 <ArrowUpRight size={14} />
          </a>
        </>
      )}
      {['profile', 'education', 'graduate-log'].includes(section) && (
        <section>
          <span className="eyebrow">教育经历</span>
          {profile.education
            .filter(
              (e) =>
                section !== 'graduate-log' || e.id === 'education-graduate',
            )
            .map((e) => (
              <div className="timeline-item" key={e.id}>
                <time>
                  {e.start} — {e.end || '至今'}
                </time>
                <h3>{e.school}</h3>
                <p>
                  {e.degree}
                  {e.major ? ` · ${e.major}` : ''}
                </p>
              </div>
            ))}
          {section === 'graduate-log' && (
            <p className="profile-intro">
              这一阶段的记录，从理解工程、验证结果和整理方法开始。新的成果确认后，会继续归入这里。
            </p>
          )}
        </section>
      )}
      {['profile', 'experience'].includes(section) && (
        <section>
          <span className="eyebrow">集训室里的旧记录</span>
          {profile.experience.map((e) => (
            <div className="timeline-item" key={e.id}>
              <time>
                {e.start} — {e.end}
              </time>
              <h3>{e.organization}</h3>
              <p>{e.role}</p>
            </div>
          ))}
          <p className="profile-intro">
            组织集训、参与算法教学与校赛出题，维护校内 OJ 的题目描述与数据。
          </p>
          <div className="historical-rating">
            <span>Codeforces</span>
            <strong>1951</strong>
            <p>Candidate Master · 简历记录的历史成绩</p>
          </div>
        </section>
      )}
      {['profile', 'honors'].includes(section) && (
        <section>
          <span className="eyebrow">UNDERGRADUATE HONORS</span>
          <h2>本科阶段的荣誉</h2>
          {awards.map((a) => (
            <div className="award-item" key={a.id}>
              <time>{a.date}</time>
              <h3>{a.title}</h3>
              {a.relatedContentIds.length > 0 &&
                (onArticle ? (
                  <button
                    className="quiet-link"
                    onClick={() => onArticle(a.relatedContentIds[0])}
                  >
                    翻开当时的比赛总结 <ArrowUpRight size={13} />
                  </button>
                ) : (
                  <a className="quiet-link" href="/posts/icpc-2022-hefei">
                    翻开当时的比赛总结 <ArrowUpRight size={13} />
                  </a>
                ))}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
