/* oxlint-disable nextjs/no-html-link-for-pages -- Full-document navigation isolates game/Phaser lifecycles and avoids the current Vinext production prefetch error. */
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Gamepad2,
  Layers3,
  ScanLine,
} from 'lucide-react';
import { IcpFilingLink } from '@/components/icp-filing-link';
import { GAMES, type GameDefinition } from '@/lib/games/catalog';
import type { ReactNode } from 'react';
import './games.css';

function GamesHeader({
  fromExplore = false,
  gamePage = false,
}: {
  fromExplore?: boolean;
  gamePage?: boolean;
}) {
  return (
    <header className="games-header">
      <a className="games-brand" href="/" aria-label="徒手拆机甲首页">
        <span className="games-brand-mark" aria-hidden="true" />
        徒手拆机甲
      </a>
      <nav className="games-nav" aria-label="游戏室导航">
        <a href={fromExplore ? '/explore' : '/workbench'}>
          {fromExplore ? '返回机甲' : '返回工作台'}
        </a>
        <a
          href={fromExplore ? '/games?from=explore' : '/games'}
          aria-current={gamePage ? undefined : 'page'}
        >
          游戏室
        </a>
        <a href={fromExplore ? '/workbench' : '/explore'}>
          {fromExplore ? '工作台' : '进入机甲'}{' '}
          <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </nav>
    </header>
  );
}

function GamesFooter() {
  return (
    <footer className="games-footer">
      <span>随时开一局，也随时回来。</span>
      <IcpFilingLink />
    </footer>
  );
}

/** A tabletop illustration, not a fabricated screenshot of a game result. */
function HoldemPreview() {
  return (
    <div className="room-holdem-preview" aria-hidden="true">
      <div className="room-preview-top">
        <span>HOLD’EM / 01</span>
        <Layers3 size={18} strokeWidth={1.4} />
      </div>
      <div className="room-holdem-table">
        <span className="room-table-rim" />
        <span className="room-table-caption">YOUR TABLE</span>
        {[1, 2, 3, 4].map((seat) => (
          <div
            className={`room-opponent-cards room-opponent-seat-${seat}`}
            key={seat}
          >
            <i />
            <i />
          </div>
        ))}
        <div className="room-community-cards">
          <span className="is-red">
            <b>Q</b>
            <i>♦</i>
          </span>
          <span>
            <b>7</b>
            <i>♣</i>
          </span>
          <span>
            <b>2</b>
            <i>♠</i>
          </span>
        </div>
        <div className="room-player-cards">
          <span>
            <b>A</b>
            <i>♠</i>
          </span>
          <span>
            <b>Q</b>
            <i>♠</i>
          </span>
        </div>
        <span className="room-chip room-chip-one" />
        <span className="room-chip room-chip-two" />
        <span className="room-chip room-chip-three" />
      </div>
      <div className="room-preview-bottom">
        <span>2–9 SEATS / 3 LEVELS</span>
        <span>自定义牌桌 · 教学复盘</span>
      </div>
    </div>
  );
}

function PulsePreview() {
  const lit = new Set([1, 4, 5, 6, 9, 10, 14]);
  return (
    <div className="room-pulse-preview" aria-hidden="true">
      <div className="room-preview-top">
        <span>SIGNAL / 02</span>
        <Gamepad2 size={18} strokeWidth={1.4} />
      </div>
      <div className="room-pulse-grid">
        {Array.from({ length: 16 }, (_, index) => (
          <i key={index} className={lit.has(index) ? 'is-on' : ''}>
            <span />
          </i>
        ))}
      </div>
      <p>一次点击，五处变化。</p>
    </div>
  );
}

export function GameRoom({ fromExplore = false }: { fromExplore?: boolean }) {
  return (
    <main className="games-shell game-room">
      <GamesHeader fromExplore={fromExplore} />
      <div className="game-room-intro">
        <span className="games-overline">
          <Gamepad2 size={16} strokeWidth={1.5} aria-hidden="true" /> THE ARCADE
        </span>
        <h1>来一局，换换脑子。</h1>
        <p>坐到练习桌前，或者解一阵灯谜。选一个喜欢的，随时开始。</p>
      </div>
      <section className="game-room-selection" aria-label="选择游戏">
        {GAMES.map((game, index) => (
          <a
            className={`room-game room-game-${game.id}`}
            href={`${game.href}${fromExplore ? '?from=explore' : ''}`}
            key={game.id}
          >
            <div className="room-game-preview">
              {game.id === 'holdem-lab' ? <HoldemPreview /> : <PulsePreview />}
            </div>
            <div className="room-game-copy">
              <div className="room-game-meta">
                <span>
                  {String(index + 1).padStart(2, '0')} / {game.category}
                </span>
                <span>{game.estimatedDuration}</span>
              </div>
              <h2>{game.title}</h2>
              <p>{game.description}</p>
              <span className="room-game-play">
                开始游戏{' '}
                <ArrowRight size={18} strokeWidth={1.5} aria-hidden="true" />
              </span>
            </div>
          </a>
        ))}
      </section>
      <div className="game-room-bottom">
        <p>不用注册，点击或轻触即可操作。离开时可以随时返回游戏室。</p>
        <a href="/explore">
          <ScanLine size={17} strokeWidth={1.5} aria-hidden="true" />
          去机甲里走走
          <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </div>
      <GamesFooter />
    </main>
  );
}

export function GamePageFrame({
  game,
  children,
  fromExplore = false,
}: {
  game: GameDefinition;
  children: ReactNode;
  fromExplore?: boolean;
}) {
  return (
    <main className="games-shell game-page">
      <GamesHeader fromExplore={fromExplore} gamePage />
      <a
        className="games-breadcrumb"
        href={fromExplore ? '/games?from=explore' : '/games'}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        返回游戏室
      </a>
      <header className="game-page-head">
        <h1>{game.title}</h1>
        <p>{game.description}</p>
      </header>
      <div className="game-stage">{children}</div>
      <p className="game-page-note">
        {game.controls}。键盘也可以用 Tab 选择按钮、Enter 或空格操作。
      </p>
      <GamesFooter />
    </main>
  );
}
