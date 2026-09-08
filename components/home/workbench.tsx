'use client';
import { useState } from 'react';
import { ArrowUpRight, ScanLine, Images } from 'lucide-react';
import type { ArticleSummary } from '@/lib/content/source';
import projects from '@/content/data/projects.json';
import './workbench.css';
export default function Workbench({ posts }: { posts: ArticleSummary[] }) {
  const [disconnected, setDisconnected] = useState(false);
  const featured = posts.filter((p) => p.status !== 'draft').slice(0, 3);
  const ospf = projects.find((p) => p.id === 'ospf-v2-demo')!;
  const album = projects.find((p) => p.id === 'intelligent-album-demo')!;
  return (
    <main id="workbench" data-disconnected={disconnected}>
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
          <article className="b-instrument" aria-labelledby="b-project-title">
            <header className="b-hardware-head">
              <div>
                <span className="b-hardware-tag b-mono">
                  01 / INTERACTIVE WORK
                </span>
                <h2 id="b-project-title">OSPF v2 Interactive Demo</h2>
              </div>
              <span className="b-screw" aria-hidden="true"></span>
            </header>
            <div className="b-screen-bezel">
              <div className="b-screen">
                <div className="b-screen-top">
                  <span className="b-mono">ROUTE STUDY / OSPF v2</span>
                  <span className="b-screen-mode">
                    <i className="b-dot" aria-hidden="true"></i>项目交互预览
                  </span>
                </div>
                <svg
                  className="b-topology"
                  viewBox="0 0 536 224"
                  role="img"
                  aria-labelledby="b-topology-title b-topology-description"
                >
                  <title id="b-topology-title">
                    {disconnected
                      ? '连接已断开，路径经过 R01、R03、R04'
                      : '连接正常，路径经过 R01、R02、R04'}
                  </title>
                  <desc id="b-topology-description">
                    四个路由节点组成两条可选路径。点击下方的断开连接按钮，会断开上方连接并切换至经过
                    R03 的下方路径。
                  </desc>
                  <g
                    stroke="#556158"
                    strokeWidth="1"
                    opacity=".27"
                    aria-hidden="true"
                  >
                    <path
                      d="M18 30h500M18 112h500M18 194h500M78 22v180M232 22v180M394 22v180"
                      strokeDasharray="2 8"
                    />
                  </g>
                  <path
                    className="b-network-base"
                    d="M26 112H78L232 55L394 112H510M78 112L232 169L394 112"
                  />
                  <path className="b-route-main" d="M78 112L232 55L394 112" />
                  <path
                    className="b-route-detour"
                    d="M78 112L232 169L394 112"
                  />
                  <path className="b-common-route" d="M26 112H78M394 112H510" />
                  <g className="b-break-mark" aria-hidden="true">
                    <path
                      d="M307 77L319 92M318 76L306 93"
                      stroke="#ec946c"
                      strokeWidth="2"
                    />
                    <rect
                      x="310"
                      y="30"
                      width="100"
                      height="20"
                      rx="2"
                      fill="#3d342d"
                    />
                    <text
                      x="360"
                      y="43"
                      fill="#efa17c"
                      textAnchor="middle"
                      fontSize="12"
                      fontFamily="ui-monospace,monospace"
                      letterSpacing="1"
                    >
                      LINK REMOVED
                    </text>
                  </g>
                  <circle className="b-router-body" cx="78" cy="112" r="16" />
                  <circle className="b-router-center" cx="78" cy="112" r="5" />
                  <circle className="b-router-body" cx="232" cy="55" r="16" />
                  <circle
                    className="b-router-center b-upper-core"
                    cx="232"
                    cy="55"
                    r="5"
                  />
                  <circle className="b-router-body" cx="232" cy="169" r="16" />
                  <circle
                    className="b-router-center b-lower-core"
                    cx="232"
                    cy="169"
                    r="5"
                  />
                  <circle className="b-router-body" cx="394" cy="112" r="16" />
                  <circle className="b-router-center" cx="394" cy="112" r="5" />
                  <circle cx="26" cy="112" r="3" fill="#dadfcf" />
                  <circle cx="510" cy="112" r="4" fill="#e88a56" />
                  <g className="b-net-id" textAnchor="middle">
                    <text x="78" y="145">
                      R01
                    </text>
                    <text x="232" y="24">
                      R02
                    </text>
                    <text x="232" y="205">
                      R03
                    </text>
                    <text x="394" y="145">
                      R04
                    </text>
                  </g>
                  <g className="b-net-annotation" textAnchor="middle">
                    <text x="26" y="93">
                      起点
                    </text>
                    <text x="504" y="93">
                      目的地
                    </text>
                  </g>
                </svg>
                <div className="b-screen-bottom">
                  <span className="b-route-output b-mono">
                    {disconnected ? 'R01 → R03 → R04' : 'R01 → R02 → R04'}
                  </span>
                  <span className="b-route-caption">
                    路径示意 · 浏览器本地模拟
                  </span>
                </div>
              </div>
            </div>
            <div className="b-control-panel">
              <div>
                <span className="b-control-caption b-mono">
                  TRY A DIFFERENT PATH
                </span>
                <p className="b-state" aria-live="polite">
                  {disconnected
                    ? '绕过断点，连接继续。'
                    : '这条路断了，还能到达吗？'}
                </p>
                <span className="b-state-description">
                  {disconnected
                    ? '路径已切换到 R03，可以恢复连接再试一次。'
                    : '断开上方连接，看看路径如何变化。'}
                </span>
              </div>
              <button
                className="b-switch"
                type="button"
                aria-pressed={disconnected}
                aria-controls="b-topology-title"
                onClick={() => setDisconnected((v) => !v)}
              >
                {disconnected ? '恢复连接' : '断开连接'}
              </button>
            </div>
            <div className="b-bottom-rail" aria-hidden="true">
              <div className="b-vents">
                <i></i>
                <i></i>
                <i></i>
                <i></i>
                <i></i>
                <i></i>
                <i></i>
                <i></i>
                <i></i>
                <i></i>
                <i></i>
                <i></i>
              </div>
              <span className="b-mono">A SMALL WORKING EXAMPLE</span>
              <span className="b-screw"></span>
            </div>
          </article>
          <div className="b-project-note">
            <p>
              从拓扑编辑，到运行验收。
              <br />
              把网络里的连接关系，变成可以试一试的东西。
            </p>
            <a
              className="b-text-link"
              href={ospf.demoUrl!}
              target="_blank"
              rel="noreferrer"
            >
              查看项目 <ArrowUpRight size={16} />
            </a>
          </div>
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
