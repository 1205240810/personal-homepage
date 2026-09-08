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
            你好，我是徒手拆机甲，现在在西北工业大学读软件工程硕士。这里放着我的文章、作品，以及一些日常记录。
          </p>
          <p className="profile-intro">
            这个博客从本科时的算法笔记开始。后来，写下来的东西慢慢多了起来：比赛后的总结、做工程时遇到的问题，还有代码之外的想法。旧文章也都留着，算是一份持续更新的个人记录。
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
          <h3 className="profile-section-heading">学习经历</h3>
          <div className="profile-education">
            {profile.education
              .filter(
                (e) =>
                  section !== 'graduate-log' || e.id === 'education-graduate',
              )
              .map((e) => (
                <div className="timeline-item" key={e.id}>
                  <time>
                    {e.start} · {e.end || '至今'}
                  </time>
                  <h3>{e.school}</h3>
                  <p>
                    {e.degree}
                    {e.major ? ` · ${e.major}` : ''}
                  </p>
                </div>
              ))}
          </div>
          {section === 'graduate-log' && (
            <p className="profile-intro">
              研究生阶段，继续学习软件工程，也接触数学建模。学习笔记和工程实践会慢慢整理到这里。
            </p>
          )}
        </section>
      )}
      {['profile', 'experience'].includes(section) && (
        <section>
          <h3 className="profile-section-heading">一起训练的日子</h3>
          <p className="profile-intro">
            本科时，有不少时间是在集训队度过的。除了自己做题、参加比赛，也参与集训组织和算法教学，给校赛出题，整理校内
            OJ 的题面与数据。
          </p>
          {profile.experience.map((e) => (
            <div className="profile-role" key={e.id}>
              <time>
                {e.start} 至 {e.end}
              </time>
              <p>
                {e.organization}
                <span>{e.role}</span>
              </p>
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
          <h3 className="profile-section-heading">赛场上的记录</h3>
          <p className="profile-intro">
            这些是求学期间留下的几项成绩。比奖项多一点的细节，写在当时的笔记和比赛总结里。
          </p>
          {(['undergraduate', 'graduate'] as const).map((stage) => (
            <div className="award-group" key={stage}>
              <h4 className="award-group-title">
                {stage === 'undergraduate' ? '本科' : '研究生'}
              </h4>
              {awards
                .filter((a) => a.chapter === stage)
                .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
                .map((a) => (
                  <div className="award-item" key={a.id}>
                    {a.date ? (
                      <time dateTime={a.date}>{a.date}</time>
                    ) : (
                      <span className="award-stage">研一</span>
                    )}
                    <div>
                      <h5>{a.competition}</h5>
                      {a.relatedContentIds.length > 0 &&
                        (onArticle ? (
                          <button
                            className="quiet-link"
                            onClick={() => onArticle(a.relatedContentIds[0])}
                          >
                            翻开当时的比赛总结 <ArrowUpRight size={13} />
                          </button>
                        ) : (
                          <a
                            className="quiet-link"
                            href="/posts/icpc-2022-hefei"
                          >
                            翻开当时的比赛总结 <ArrowUpRight size={13} />
                          </a>
                        ))}
                    </div>
                    <strong>{a.result}</strong>
                  </div>
                ))}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
