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
          <span className="eyebrow">关于我</span>
          <h2>
            徒手拆机甲<span>徒手拆机甲</span>
          </h2>
          <p className="profile-intro">
            我是徒手拆机甲，目前在西北工业大学攻读软件工程硕士。本科时写下的算法笔记，是这个博客的起点；如今，也在这里记录工程实践、学习过程和代码之外的日常。
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
          <h3 className="profile-section-heading">求学的两站</h3>
          {profile.education
            .filter(
              (e) =>
                section !== 'graduate-log' || e.id === 'education-graduate',
            )
            .map((e) => (
              <div className="timeline-item" key={e.id}>
                <time>
                  {e.start} 至 {e.end || '今'}
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
              研究生阶段，继续沿着软件工程往下学习，也把问题的范围从算法扩展到建模与工程实践。研一获得了华为杯中国研究生数学建模竞赛全国三等奖。
            </p>
          )}
        </section>
      )}
      {['profile', 'experience'].includes(section) && (
        <section>
          <h3 className="profile-section-heading">从做题，到一起训练</h3>
          <p className="profile-intro">
            本科的算法经历不只在赛场。也参与过集训组织、算法教学和校赛出题，维护校内
            OJ 的题目描述与数据，把解题经验整理给一起训练的同学。
          </p>
          {profile.experience.map((e) => (
            <div className="timeline-item" key={e.id}>
              <time>
                {e.start} 至 {e.end}
              </time>
              <h3>{e.organization}</h3>
              <p>{e.role}</p>
            </div>
          ))}
          <div className="historical-rating">
            <div>
              <span>{profile.historicalAchievements[0].platform}</span>
              <strong>{profile.historicalAchievements[0].rating}</strong>
            </div>
            <p>
              {profile.historicalAchievements[0].title}
              <small>简历记录的历史成绩</small>
            </p>
          </div>
        </section>
      )}
      {['profile', 'honors'].includes(section) && (
        <section>
          <h2>一些值得留下的成绩</h2>
          <p className="profile-intro">
            从程序设计到数学建模，竞赛留下了不同阶段的记录。这里选取几项，也保留了当时的比赛总结。
          </p>
          <div className="award-highlights">
            {awards
              .filter((a) => a.chapter !== 'undergraduate')
              .map((a) => (
                <div className="award-highlight" key={a.id}>
                  <h3>{a.competition}</h3>
                  <strong>{a.result}</strong>
                  {a.period && <span className="award-period">{a.period}</span>}
                </div>
              ))}
          </div>
          <div className="award-undergraduate">
            <h3 className="profile-section-heading">本科赛场 · 2022</h3>
            <p className="profile-intro">
              更早的记录来自本科集训队。那时写下的算法笔记和 ICPC
              合肥站总结，仍然留在博客里。
            </p>
            {awards
              .filter((a) => a.chapter === 'undergraduate')
              .slice()
              .reverse()
              .map((a) => (
                <div className="award-item" key={a.id}>
                  <time dateTime={a.date ?? undefined}>{a.date}</time>
                  <div>
                    <h4>{a.competition}</h4>
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
                  <strong>{a.result}</strong>
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
