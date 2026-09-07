'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Compass,
  Layers3,
  LoaderCircle,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SCENES, CHAPTERS, getScene } from '@/lib/world/registry';
import type {
  GameHandle,
  InteractionNode,
  WorldAction,
  WorldSnapshot,
} from '@/lib/world/types';
import type { Article, ArticleSummary } from '@/lib/content/source';
import { ArticleView, ProfileView } from './archive-reader';

type Panel =
  | 'directory'
  | 'article'
  | 'profile'
  | 'education'
  | 'honors'
  | 'experience'
  | 'graduate-log'
  | null;
export default function WorldShell({
  posts,
  preview,
}: {
  posts: ArticleSummary[];
  preview: boolean;
}) {
  const mount = useRef<HTMLDivElement>(null),
    game = useRef<GameHandle | null>(null);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [sceneId, setSceneId] = useState('hub'),
    [near, setNear] = useState<InteractionNode | null>(null),
    [blueprint, setBlueprint] = useState(false),
    [panel, setPanel] = useState<Panel>(null),
    [chapter, setChapter] = useState('all'),
    [tag, setTag] = useState('all'),
    [article, setArticle] = useState<Article | null>(null),
    [articleError, setArticleError] = useState(''),
    [snapshot, setSnapshot] = useState<WorldSnapshot | null>(null),
    [notice, setNotice] = useState('');
  const actionRef = useRef<(action: WorldAction) => void>(() => {}),
    abortRef = useRef<AbortController | null>(null);
  const openArticle = useCallback((id: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setPanel('article');
    setArticle(null);
    setArticleError('');
    fetch(`/api/content/${encodeURIComponent(id)}`, { signal: ac.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error('这篇记录暂时无法打开。');
        return r.json() as Promise<{ article: Article }>;
      })
      .then((d) => {
        if (!ac.signal.aborted) setArticle(d.article);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setArticleError(e.message);
      });
  }, []);
  actionRef.current = (action) => {
    if (action.type === 'open-collection') {
      setChapter(action.chapter || 'all');
      setTag('all');
      setPanel('directory');
    } else if (action.type === 'open-content') {
      if (
        [
          'profile',
          'education',
          'honors',
          'experience',
          'graduate-log',
        ].includes(action.contentId)
      )
        setPanel(action.contentId as Panel);
      else openArticle(action.contentId);
    } else if (action.type === 'enter-scene')
      game.current?.enter(action.sceneId, action.spawnId);
  };
  useEffect(() => {
    let disposed = false;
    import('@/lib/world/engine')
      .then(({ createWorld }) => {
        if (disposed || !mount.current) return;
        const requestedScene = new URLSearchParams(location.search).get(
          'scene',
        );
        let initialNavigationDone = false;
        game.current = createWorld(mount.current, {
          onAction: (a) => actionRef.current(a),
          onScene: setSceneId,
          onNear: setNear,
          onState: setSnapshot,
          onReady: () => {
            setReady(true);
            if (
              !initialNavigationDone &&
              requestedScene &&
              SCENES.some((s) => s.id === requestedScene)
            ) {
              initialNavigationDone = true;
              queueMicrotask(() => {
                if (!disposed) game.current?.enter(requestedScene);
              });
            }
          },
          onError: setError,
        });
      })
      .catch(() => setError('探索画面暂时无法启动，你仍然可以从目录阅读。'));
    return () => {
      disposed = true;
      abortRef.current?.abort();
      game.current?.destroy();
      game.current = null;
    };
  }, []);
  useEffect(() => {
    game.current?.pause(!!panel || blueprint);
    if (!panel) abortRef.current?.abort();
  }, [panel, blueprint, ready]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.code === 'KeyM' && !panel) {
        e.preventDefault();
        setBlueprint((x) => !x);
      }
      if (e.key === 'Escape' && !panel) setBlueprint(false);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [panel]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(id);
  }, [notice]);
  const scene = getScene(sceneId),
    filtered = posts.filter(
      (p) =>
        (chapter === 'all' || p.chapter === chapter) &&
        (tag === 'all' || p.tags.includes(tag)),
    );
  const tags = [
    ...new Set(
      posts
        .filter((p) => chapter === 'all' || p.chapter === chapter)
        .flatMap((p) => p.tags),
    ),
  ];
  const enter = (id: string) => {
    setBlueprint(false);
    setPanel(null);
    game.current?.pause(false);
    game.current?.enter(id);
  };
  const interact = () => {
    if (near?.action.type === 'activate-armor')
      setNotice(
        snapshot?.armorOpen
          ? '装甲已经打开，线路仍然亮着。'
          : '装甲正在移开，旧档案重新亮起。',
      );
    game.current?.interact();
  };
  const close = () => {
    setPanel(null);
    setArticleError('');
  };
  const panelTitles: Record<string, string> = {
    profile: '维修工牌',
    education: '驾驶舱日志',
    honors: '荣誉器材柜',
    experience: '集训白板',
    'graduate-log': '阶段记录屏',
  };
  return (
    <main
      className={`world-shell ${blueprint ? 'is-blueprint' : ''}`}
      aria-label="沉睡机甲档案馆，可探索的个人世界"
    >
      <div className="world-art" aria-hidden="true" />
      <div
        ref={mount}
        className={`game-mount ${ready ? 'is-ready' : ''}`}
        role="application"
        aria-label="用方向键或 WASD 移动，E 与附近物件互动，M 打开拆解图。也可点击目录直接阅读。"
        tabIndex={0}
      />
      <div className="world-vignette" />
      <header className="world-header">
        <a className="wordmark" href="/" aria-label="徒手拆机甲首页">
          <span className="brand-mark">拆</span>
          <span>
            徒手拆机甲<small>THE SLEEPING ARCHIVE</small>
          </span>
        </a>
        <nav aria-label="主导航">
          <Button
            variant="ghost"
            className="nav-button"
            render={<a href="/archive" />}
            nativeButton={false}
            onClick={(event) => {
              event.preventDefault();
              setChapter('all');
              setTag('all');
              setPanel('directory');
            }}
          >
            <BookOpen size={15} />
            目录
          </Button>
          <Button
            variant="ghost"
            className="nav-button"
            onClick={() => setBlueprint((v) => !v)}
            aria-pressed={blueprint}
          >
            <Layers3 size={15} />
            {blueprint ? '返回世界' : '拆解图'}
            <kbd>M</kbd>
          </Button>
        </nav>
      </header>
      {!blueprint && (
        <>
          <div className="world-caption">
            <span className="eyebrow">{scene.description}</span>
            <h1>
              {scene.title}
              <span>{scene.en}</span>
            </h1>
            {sceneId === 'hub' ? (
              <p>沿着亮起的线路，去往代码、旧事与生活。</p>
            ) : (
              <button className="return-link" onClick={() => enter('hub')}>
                <ArrowLeft size={13} />
                返回维修甲板
              </button>
            )}
          </div>
          {ready && near && !panel && (
            <button className="interaction-prompt" onClick={interact}>
              <kbd>E</kbd>
              <span>
                <strong>{near.label}</strong>
                <small>{near.hint}</small>
              </span>
              <ArrowUpRight size={17} />
            </button>
          )}
          {notice && (
            <div className="world-notice" role="status">
              {notice}
              <button onClick={() => game.current?.skip()}>跳过动画</button>
            </div>
          )}
          {!ready && !error && (
            <div className="world-loading" role="status">
              <LoaderCircle size={14} /> 正在接通档案馆
            </div>
          )}
          {error && (
            <div className="world-error" role="alert">
              {error}
              <Button variant="outline" onClick={() => setPanel('directory')}>
                打开目录
              </Button>
            </div>
          )}
          <div className="mobile-controls" aria-label="触控方向控制">
            <div className="dpad">
              {[
                { icon: ArrowUp, x: 0, y: -1, c: 'up', label: '向上移动' },
                { icon: ArrowLeft, x: -1, y: 0, c: 'left', label: '向左移动' },
                { icon: ArrowDown, x: 0, y: 1, c: 'down', label: '向下移动' },
                { icon: ArrowRight, x: 1, y: 0, c: 'right', label: '向右移动' },
              ].map((d) => (
                <button
                  className={d.c}
                  key={d.c}
                  aria-label={d.label}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    game.current?.setDirection({ x: d.x, y: d.y });
                  }}
                  onPointerUp={() => game.current?.setDirection({ x: 0, y: 0 })}
                  onPointerCancel={() =>
                    game.current?.setDirection({ x: 0, y: 0 })
                  }
                  onLostPointerCapture={() =>
                    game.current?.setDirection({ x: 0, y: 0 })
                  }
                >
                  <d.icon size={18} />
                </button>
              ))}
            </div>
            <button
              className="touch-interact"
              onClick={interact}
              disabled={!near}
              aria-label="与附近物件互动"
            >
              E
            </button>
          </div>
        </>
      )}
      {blueprint && (
        <section className="blueprint-layer" aria-label="机甲拆解图">
          <div className="blueprint-grid" />
          <div className="atlas-heading">
            <span className="eyebrow">THE ANATOMY OF A LIFE</span>
            <h2>
              把故事，
              <br />
              一层层拆开。
            </h2>
            <p>
              选择一个舱室，继续探索。
              <br />
              也可以直接翻开其中的记录。
            </p>
            <Button
              variant="ghost"
              className="atlas-return"
              onClick={() => setBlueprint(false)}
            >
              <ArrowLeft size={14} />
              返回所在位置
            </Button>
          </div>
          <div className="atlas-image" />
          <svg
            className="atlas-lines"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d="M 74 43 L 57 43 L 57 62 M 65 26 L 85 26 L 85 43 M 77 73 L 87 73 L 87 59" />
          </svg>
          <div className="atlas-chapters">
            {CHAPTERS.map((c, i) => {
              const s = getScene(c.scene),
                items = posts.filter((p) => p.chapter === c.id);
              return (
                <div key={c.id} className={`atlas-chapter chapter-${c.id}`}>
                  <span className="atlas-number">0{i + 1}</span>
                  <div>
                    <small>
                      {c.title} / {c.subtitle}
                    </small>
                    <h3>{s.title}</h3>
                    <p>
                      {items.length
                        ? `${items.length} 篇记录 · ${items[0].date}`
                        : '新的记录正在整理'}
                    </p>
                    <div className="atlas-actions">
                      <Button size="sm" onClick={() => enter(c.scene)}>
                        <Compass size={13} />
                        进入场景
                      </Button>
                      <button
                        onClick={() => {
                          setChapter(c.id);
                          setTag('all');
                          setPanel('directory');
                        }}
                      >
                        阅读目录
                        <ArrowUpRight size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
      <footer className="world-footer">
        <span className="world-coordinate">
          {ready
            ? `${scene.en} / 已探索 ${snapshot?.visited.length || 0} 处`
            : 'THE SLEEPING ARCHIVE'}
        </span>
        <span className="control-hint">
          <kbd>W A S D</kbd> 移动 <i />
          <kbd>E</kbd> 互动 <i />
          <kbd>M</kbd> 总览
        </span>
        <span className="live-label">
          <b />
          {snapshot?.armorOpen ? '旧档案已经苏醒' : '探索一段故事'}
        </span>
      </footer>
      <Sheet
        open={panel !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <SheetContent
          className={`directory-sheet ${panel === 'article' ? 'reader-sheet' : ''}`}
          showCloseButton={false}
        >
          <div className="panel-heading">
            <span className="eyebrow">
              {panel === 'directory'
                ? 'THE ARCHIVE'
                : panel === 'article'
                  ? 'A PAGE FROM THE ARCHIVE'
                  : 'FOUND IN THE COCKPIT'}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={close}
              aria-label="关闭面板，返回探索"
            >
              <X />
            </Button>
          </div>
          {panel === 'directory' ? (
            <>
              <SheetTitle className="panel-title">
                旧日的代码，
                <br />
                沿途的故事。
              </SheetTitle>
              <SheetDescription>
                每一篇记录，都在这个世界里有一个位置。
              </SheetDescription>
              <Tabs
                value={chapter}
                onValueChange={(v) => {
                  setChapter(String(v));
                  setTag('all');
                }}
              >
                <TabsList className="directory-tabs" variant="line">
                  <TabsTrigger value="all">全部</TabsTrigger>
                  {CHAPTERS.map((c) => (
                    <TabsTrigger value={c.id} key={c.id}>
                      {c.title}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              {tags.length > 0 && (
                <div className="tag-filters">
                  <button
                    data-active={tag === 'all'}
                    onClick={() => setTag('all')}
                  >
                    全部主题
                  </button>
                  {tags.map((t) => (
                    <button
                      data-active={tag === t}
                      key={t}
                      onClick={() => setTag(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
              <div className="article-list">
                {filtered.map((p, i) => (
                  <button
                    className="article-item"
                    key={p.id}
                    onClick={() => openArticle(p.id)}
                  >
                    <small>
                      {String(i + 1).padStart(2, '0')} / {p.date}
                      {p.status === 'draft' ? ' · 草稿' : ''}
                    </small>
                    <h3>
                      {p.title}
                      <ArrowUpRight size={16} />
                    </h3>
                    <p>{p.summary}</p>
                    <span className="article-tags">
                      {p.tags.join(' / ')} · {p.readingMinutes} 分钟
                    </span>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="empty-message">这一格书架，留给下一篇记录。</p>
                )}
              </div>
              <div className="directory-bottom">
                <a href="/archive">
                  独立文章目录
                  <ArrowUpRight size={13} />
                </a>
                <button onClick={() => setPanel('profile')}>
                  关于这台机甲的主人
                  <ArrowUpRight size={13} />
                </button>
              </div>
              {preview && (
                <p className="preview-note">
                  含 {posts.filter((p) => p.status === 'draft').length}{' '}
                  篇待核对草稿 · 仅用于私有预览
                </p>
              )}
            </>
          ) : panel === 'article' ? (
            <>
              <SheetTitle className="sr-only">
                {article?.title || '读取文章'}
              </SheetTitle>
              <SheetDescription className="sr-only">
                文章阅读，关闭后回到原来的探索位置。
              </SheetDescription>
              {article ? (
                <ArticleView article={article} embedded />
              ) : articleError ? (
                <div className="reader-status" role="alert">
                  {articleError}
                  <button onClick={() => setPanel('directory')}>
                    返回目录
                  </button>
                </div>
              ) : (
                <div className="reader-status" role="status">
                  <LoaderCircle />
                  正在展开这页记录
                </div>
              )}
            </>
          ) : (
            <>
              <SheetTitle className="profile-panel-title">
                {panelTitles[panel || 'profile']}
              </SheetTitle>
              <SheetDescription className="sr-only">
                从场景物件中发现的个人档案。
              </SheetDescription>
              <ProfileView
                section={panel || 'profile'}
                onArticle={openArticle}
              />
            </>
          )}
        </SheetContent>
      </Sheet>
    </main>
  );
}
