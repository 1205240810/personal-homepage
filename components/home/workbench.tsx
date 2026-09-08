'use client';
import { ProjectWorkbench } from './project-workbench';
import { ArrowUpRight, ScanLine, Images } from 'lucide-react';
import type { ArticleSummary } from '@/lib/content/source';
import projects from '@/content/data/projects.json';
import './workbench.css';
export default function Workbench({ posts }: { posts: ArticleSummary[] }) {
  const featured = posts.filter((p) => p.status !== 'draft').slice(0, 3);
  const album = projects.find((p) => p.id === 'intelligent-album-demo')!;
  return (
    <main id="workbench">
      <header className="b-header">
        <a className="b-brand" href="/" aria-label="徒手拆机甲首页">
          <span className="b-brand-mark" aria-hidden="true" />
          徒手拆机甲
        </a>
        <nav className="b-nav" aria-label="主要导航">
          <a href="/projects">
            <span className="b-nav-index b-mono">01</span>作品
          </a>
          <a href="/archive">
            <span className="b-nav-index b-mono">02</span>文章
          </a>
          <a href="/about">
            <span className="b-nav-index b-mono">03</span>关于
          </a>
          <a href="/explore" className="b-explore-nav">
            进入机甲 <ArrowUpRight size={14} />
          </a>
        </nav>
      </header>
      <div className="b-intro">
        <div>
          <h1>
            <span>把想法拆开，</span>
            <span>让它运转。</span>
          </h1>
          <p>徒手拆机甲 · 算法、工程与日常</p>
        </div>
        <div className="b-index b-mono" aria-hidden="true">
          A PERSONAL WORKBENCH
          <br />
          THOUGHT → WORK → NOTES
        </div>
      </div>
      <div className="b-layout">
        <div className="b-project">
          <ProjectWorkbench />
        </div>
        <aside className="b-sidebar" aria-label="文章和其他作品">
          <section className="b-writing" aria-labelledby="b-writing-title">
            <header className="b-section-head">
              <h2 id="b-writing-title">
                <span className="b-section-number b-mono">02</span>文章与笔记
              </h2>
              <a className="b-text-link" href="/archive">
                全部文章 <ArrowUpRight size={14} />
              </a>
            </header>
            {featured.map((post, i) => (
              <a
                className="b-article"
                href={`/posts/${post.slug}`}
                key={post.id}
              >
                <span className="b-article-kicker">
                  {post.date.slice(0, 10)} · {post.tags[0] || '笔记'}
                </span>
                <span className="b-article-title">
                  <span>{post.title}</span>
                  <ArrowUpRight className="b-arrow" size={17} />
                </span>
                {i === 0 && (
                  <span className="b-article-description">{post.summary}</span>
                )}
              </a>
            ))}
          </section>
          <section className="b-album" aria-labelledby="b-album-title">
            <div className="b-album-tag">
              <span>另一件作品</span>
              <span className="b-mono">03 / PROJECT</span>
            </div>
            <a
              className="b-album-button"
              href={album.demoUrl!}
              target="_blank"
              rel="noreferrer"
            >
              <span>
                <span className="b-album-name" id="b-album-title">
                  {album.title} ↗
                </span>
                <p>
                  从时间、位置和像素特征，
                  <br />
                  读懂照片里的线索。
                </p>
              </span>
              <Images size={35} strokeWidth={1} color="#7d8970" />
            </a>
          </section>
          <a href="/explore" className="b-mode-link">
            <span className="b-mode-symbol">
              <ScanLine size={22} strokeWidth={1.2} />
            </span>
            <span>
              <strong>去机甲里走走</strong>
              <small>驾驶舱、档案库，还有一间工坊。</small>
            </span>
            <ArrowUpRight className="b-arrow" size={17} />
          </a>
        </aside>
      </div>
      <footer className="b-footer">
        <span className="b-mono">MADE OF QUESTIONS, CODE & EVERYDAY LIFE.</span>
        <a href="/about">关于这张工作台，也关于我 ↗</a>
      </footer>
    </main>
  );
}
