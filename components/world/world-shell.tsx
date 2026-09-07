'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Layers3,
  CircleHelp,
  FolderGit2,
  UserRound,
  LoaderCircle,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
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
import { MusicControl } from './music-control';
import { ProjectsView } from './projects-view';
import { MiniGameView, GAME_TITLES } from './mini-games';
import { WorldAtlas } from './world-atlas';
import { StartScreen, WalkerPortrait } from './start-screen';
import type { MiniGameId } from '@/lib/world/types';

type Panel =
  | 'directory'
  | 'article'
  | 'profile'
  | 'education'
  | 'honors'
  | 'experience'
  | 'graduate-log'
  | 'projects'
  | 'game'
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
    [notice, setNotice] = useState(''),
    [miniGame, setMiniGame] = useState<MiniGameId>('circuit'),
    [help, setHelp] = useState(false),
    [intro, setIntro] = useState(true),
    [welcome, setWelcome] = useState(true),
    [leaving, setLeaving] = useState(false);
  const welcomeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    if (action.type === 'open-projects') {
      setPanel('projects');
      return;
    }
    if (action.type === 'open-game') {
      setMiniGame(action.game);
      setPanel('game');
      return;
    }
    if (action.type === 'discover') {
      setNotice(
        action.discovery === 'sleepy-eye'
          ? '小模型眨了眨眼：今天也辛苦了。'
          : '找到一位毛茸茸的值班员。它似乎比你更熟悉这里。',
      );
      return;
    }
    if (action.type === 'activate-armor') {
      setNotice('小模型的装甲打开了，桌上的指示灯亮了起来。');
      return;
    }
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
          onNotice: setNotice,
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
    game.current?.pause(!!panel || blueprint || help || welcome);
    if (!panel) abortRef.current?.abort();
  }, [panel, blueprint, help, ready, welcome]);
  useEffect(() => {
    try {
      if (sessionStorage.getItem('courtyard-entered')) setWelcome(false);
    } catch {}
    return () => {
      if (welcomeTimer.current) clearTimeout(welcomeTimer.current);
    };
  }, []);
  function start(read = false) {
    try {
      sessionStorage.setItem('courtyard-entered', '1');
    } catch {}
    if (read) {
      setWelcome(false);
      setChapter('all');
      setTag('all');
      setPanel('directory');
      return;
    }
    setLeaving(true);
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    welcomeTimer.current = setTimeout(
      () => {
        setWelcome(false);
        setLeaving(false);
        setIntro(true);
      },
      reduced ? 0 : 850,
    );
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.code === 'KeyM' && !panel && !welcome) {
        e.preventDefault();
        setBlueprint((x) => !x);
      }
      if (e.key === 'Escape' && !panel) setBlueprint(false);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [panel, welcome]);
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
  useEffect(() => {
    if (welcome) return;
    const timer = setTimeout(() => setIntro(false), 7500);
    return () => clearTimeout(timer);
  }, [welcome]);
  const enter = (id: string) => {
    setBlueprint(false);
    setPanel(null);
    game.current?.pause(false);
    const returnSpawn: Record<string, string> = {
      undergraduate: 'blog',
      graduate: 'projects',
      life: 'lounge',
    };
    game.current?.enter(id, id === 'hub' ? returnSpawn[sceneId] : undefined);
  };
  const interact = () => game.current?.interact();
  const close = () => {
    setPanel(null);
    setArticleError('');
  };
  const panelTitles: Record<string, string> = {
    profile: '住处档案',
    education: '教育与经历',
    honors: '荣誉记录',
    experience: '集训经历',
    'graduate-log': '阶段记录',
  };
  return (
    <main
      className={`world-shell ${blueprint ? 'is-blueprint' : ''} ${welcome ? 'has-start-screen' : ''}`}
      aria-label="林间小院，可探索的个人世界"
    >
      <div className="world-art" aria-hidden="true" />
      <div
        ref={mount}
        className={`game-mount ${ready ? 'is-ready' : ''}`}
        role="application"
        aria-label="用方向键或 WASD 移动，E 与附近物件互动，M 打开小院地图。也可点击目录直接阅读。"
        tabIndex={0}
      />
      <div className="world-vignette" />
      <header className="world-header">
        <a
          className="wordmark"
          href="/"
          aria-label="徒手拆机甲开始菜单"
          onClick={(event) => {
            event.preventDefault();
            setPanel(null);
            setBlueprint(false);
            setWelcome(true);
          }}
        >
          <WalkerPortrait />
          <span>
            徒手拆机甲<small>THE COURTYARD</small>
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
            文章
          </Button>
          <Button
            variant="ghost"
            className="nav-button"
            render={<a href="/projects" />}
            nativeButton={false}
            onClick={(event) => {
              event.preventDefault();
              setPanel('projects');
            }}
          >
            <FolderGit2 size={15} />
            项目
          </Button>
          <Button
            variant="ghost"
            className="nav-button"
            render={<a href="/about" />}
            nativeButton={false}
            onClick={(event) => {
              event.preventDefault();
              setPanel('profile');
            }}
          >
            <UserRound size={15} />
            关于
          </Button>
          <MusicControl reading={!!panel} />
        </nav>
      </header>
      {welcome && (
        <StartScreen
          ready={ready}
          error={error}
          leaving={leaving}
          onEnter={() => start()}
          onRead={() => start(true)}
        />
      )}
      {!blueprint && (
        <>
          <h1 className="sr-only">{scene.title}</h1>
          {sceneId !== 'hub' && (
            <button className="room-return" onClick={() => enter('hub')}>
              <ArrowLeft size={15} />
              回到小院
            </button>
          )}
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
              {notice.includes('装甲') && (
                <button onClick={() => game.current?.skip()}>跳过动画</button>
              )}
            </div>
          )}
          {!ready && !error && (
            <div className="world-loading" role="status">
              <LoaderCircle size={14} /> 正在推开院门
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
        <WorldAtlas
          posts={posts}
          snapshot={snapshot}
          onClose={() => setBlueprint(false)}
          onAction={(action) => actionRef.current(action)}
          onWalk={(node) => {
            setBlueprint(false);
            game.current?.pause(false);
            game.current?.walkTo(node);
          }}
        />
      )}
      <footer className="quiet-world-tools">
        <Popover open={help} onOpenChange={setHelp}>
          <PopoverTrigger
            render={
              <button aria-label="操作说明" className="world-tool-button" />
            }
          >
            <CircleHelp size={18} />
          </PopoverTrigger>
          <PopoverContent className="world-help" align="start">
            <p>点击房子，沿路走到门前。</p>
            <p>
              <kbd>WASD</kbd> / 方向键移动
              <br />
              <kbd>E</kbd> 与附近物件互动
              <br />
              <kbd>F</kbd> 踢小球
              <br />
              <kbd>M</kbd> 小院地图
            </p>
            <p>也可以从上方直接阅读内容。</p>
          </PopoverContent>
        </Popover>
        <button
          className="world-tool-button"
          aria-label="小院地图"
          onClick={() => setBlueprint((v) => !v)}
        >
          <Layers3 size={18} />
        </button>
        {intro && !panel && (
          <span className="first-visit-hint">点一间房子，沿着小路走走。</span>
        )}
      </footer>
      <Sheet
        open={panel !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <SheetContent
          className={`directory-sheet ${panel === 'article' ? 'reader-sheet' : panel === 'game' ? 'game-sheet' : ''}`}
          showCloseButton={false}
        >
          <div className="panel-heading">
            <span className="eyebrow">
              {panel === 'directory'
                ? 'THE ARCHIVE'
                : panel === 'article'
                  ? 'A PAGE FROM THE ARCHIVE'
                  : panel === 'projects'
                    ? 'THE WORK STUDIO'
                    : panel === 'game'
                      ? 'AFTER HOURS'
                      : 'AT HOME'}
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
              <SheetTitle className="panel-title">文章</SheetTitle>
              <SheetDescription>算法、工程与代码之外的生活。</SheetDescription>
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
                  关于小院的主人
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
          ) : panel === 'projects' ? (
            <>
              <SheetTitle className="panel-title">GitHub 项目</SheetTitle>
              <SheetDescription>
                项目说明、源码与可以直接打开的演示。
              </SheetDescription>
              <ProjectsView />
            </>
          ) : panel === 'game' ? (
            <>
              <SheetTitle className="panel-title">
                {GAME_TITLES[miniGame]}
              </SheetTitle>
              <SheetDescription className="sr-only">
                小游戏进行时人物暂停，关闭后回到原来的位置。
              </SheetDescription>
              <MiniGameView
                key={miniGame}
                game={miniGame}
                best={snapshot?.games[miniGame]}
                onComplete={(moves) =>
                  game.current?.completeGame(miniGame, moves)
                }
              />
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
