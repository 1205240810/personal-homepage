/* oxlint-disable nextjs/no-html-link-for-pages -- Full-document navigation isolates game/Phaser lifecycles and avoids the current Vinext production prefetch error. */
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Gamepad2,
  Grid3X3,
  Dices,
  Layers3,
  ScanLine,
  Zap,
  ScanSearch,
} from 'lucide-react';
import { IcpFilingLink } from '@/components/icp-filing-link';
import { GAMES, type GameDefinition } from '@/lib/games/catalog';
import { PULSE_LEVELS } from '@/lib/pulse-puzzle';
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
        <span>SIGNAL / {PULSE_LEVELS.length} LEVELS</span>
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

function BlackjackPreview() {
  return (
    <div className="room-blackjack-preview" aria-hidden="true">
      <div className="room-preview-top">
        <span>BLACKJACK / 21</span>
        <Layers3 size={18} strokeWidth={1.4} />
      </div>
      <div className="room-blackjack-dealer">
        <span>庄家</span>
        <i>?</i>
      </div>
      <div className="room-blackjack-hand">
        <span>
          <b>A</b>
          <i>♠</i>
        </span>
        <span className="is-red">
          <b>7</b>
          <i>♥</i>
        </span>
      </div>
      <div className="room-preview-bottom">
        <span>S17 / 3:2</span>
        <span>标准筹码 · 赛后教练</span>
      </div>
    </div>
  );
}

function SudokuPreview() {
  const cells =
    '530070000600195000098000060800060003400803001700020006060000280000419005000080079'
      .split('')
      .map(Number);
  return (
    <div className="room-sudoku-preview" aria-hidden="true">
      <div className="room-preview-top">
        <span>NINE ROOMS</span>
        <Grid3X3 size={18} strokeWidth={1.4} />
      </div>
      <div className="room-sudoku-board">
        {cells.map((digit, index) => (
          <span key={index} className={index === 40 ? 'is-selected' : ''}>
            {digit || (index === 40 ? <small>5</small> : '')}
          </span>
        ))}
      </div>
      <div className="room-preview-bottom">
        <span>120 PUZZLES</span>
        <span>一格一格，看见推理</span>
      </div>
    </div>
  );
}

function DicePreview() {
  const faces = [
    [0, 2, 4, 6, 8],
    [0, 2, 6, 8],
    [0, 4, 8],
    [0, 2, 6, 8],
    [0, 2, 6, 8],
  ];
  return (
    <div className="room-dice-preview" aria-hidden="true">
      <div className="room-preview-top">
        <span>THE BLUE HOUR</span>
        <Dices size={18} strokeWidth={1.4} />
      </div>
      <div className="room-dice-tray">
        {faces.map((pips, index) => (
          <span
            className={`room-die ${index === 1 || index > 2 ? 'is-held' : ''}`}
            key={index}
          >
            {Array.from({ length: 9 }, (_, position) => (
              <i
                key={position}
                className={pips.includes(position) ? 'is-pip' : ''}
              />
            ))}
          </span>
        ))}
      </div>
      <div className="room-dice-score">
        <span>保留点数</span>
        <span>选择分栏</span>
        <span>与 AI 对弈</span>
      </div>
      <div className="room-preview-bottom">
        <span>5 DICE / 13 TURNS</span>
        <span>留住机会，也留住取舍</span>
      </div>
    </div>
  );
}

function StudPreview() {
  const cards = [
    { rank: '?', suit: '' },
    { rank: 'Q', suit: '♥' },
    { rank: '7', suit: '♣' },
    { rank: '2', suit: '♦' },
    { rank: 'A', suit: '♠' },
  ];
  return (
    <div className="room-stud-preview" aria-hidden="true">
      <div className="room-preview-top">
        <span>VELVET FIVE</span>
        <Layers3 size={18} strokeWidth={1.4} />
      </div>
      <div className="room-stud-hand">
        {cards.map((card, index) => (
          <span
            className={`${index === 0 ? 'is-hidden' : ''} ${index === 1 || index === 3 ? 'is-red' : ''}`}
            key={card.rank}
          >
            <b>{card.rank}</b>
            <i>{card.suit}</i>
          </span>
        ))}
      </div>
      <div className="room-stud-streets">
        <span>01</span>
        <i />
        <span>02</span>
        <i />
        <span>03</span>
        <i />
        <span>04</span>
      </div>
      <div className="room-preview-bottom">
        <span>ONE HIDDEN / FOUR OPEN</span>
        <span>逐轮展开，回看选择</span>
      </div>
    </div>
  );
}

/** Static 4×4 wiring sketch: a lit branch from the core and one dark, unturned tile. */
function CircuitPreview() {
  // Edge bits clockwise from the top (1 上, 2 右, 4 下, 8 左); 0 = core.
  const tiles = [4, 4, 6, 8, 5, 3, 13, 4, 7, 14, 11, 9, 1, 3, 10, 1];
  const dark = new Set([15]);
  return (
    <div className="room-circuit-preview" aria-hidden="true">
      <div className="room-preview-top">
        <span>WIRING / 07</span>
        <Zap size={18} strokeWidth={1.4} />
      </div>
      <div className="room-circuit-grid">
        {tiles.map((mask, index) => (
          <svg
            viewBox="0 0 100 100"
            key={index}
            className={dark.has(index) ? '' : 'is-on'}
          >
            {mask & 1 ? <line x1="50" y1="50" x2="50" y2="0" /> : null}
            {mask & 2 ? <line x1="50" y1="50" x2="100" y2="50" /> : null}
            {mask & 4 ? <line x1="50" y1="50" x2="50" y2="100" /> : null}
            {mask & 8 ? <line x1="50" y1="50" x2="0" y2="50" /> : null}
            {index === 5 ? (
              <rect x="30" y="30" width="40" height="40" rx="7" />
            ) : [0, 1, 3, 7, 12, 15].includes(index) ? (
              <circle cx="50" cy="50" r="16" />
            ) : null}
          </svg>
        ))}
      </div>
      <div className="room-preview-bottom">
        <span>4–7 GRID / DAILY</span>
        <span>转一转，接回每盏灯</span>
      </div>
    </div>
  );
}

/** Static diagnostic sketch: scanned signals, two flags and one live fault. */
function SweeperPreview() {
  // '' hidden, '0' open, digits = signal, 'F' flag.
  const cells = [
    '0',
    '1',
    'F',
    '1',
    '0',
    '0',
    '0',
    '1',
    '1',
    '1',
    '0',
    '0',
    '1',
    '1',
    '0',
    '1',
    '1',
    '1',
    'F',
    '1',
    '0',
    '1',
    '',
    '',
    '2',
    '2',
    '1',
    '2',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ];
  return (
    <div className="room-sweeper-preview" aria-hidden="true">
      <div className="room-preview-top">
        <span>FAULT SCAN / 08</span>
        <ScanSearch size={18} strokeWidth={1.4} />
      </div>
      <div className="room-sweeper-grid">
        {cells.map((cell, index) => (
          <span
            key={index}
            className={cell === '' ? '' : cell === 'F' ? 'is-flag' : 'is-open'}
            data-n={cell}
          >
            {cell === 'F' ? '⚑' : cell === '0' ? '' : cell}
          </span>
        ))}
      </div>
      <div className="room-preview-bottom">
        <span>3 LEVELS / DAILY</span>
        <span>读信号，插旗，别短路</span>
      </div>
    </div>
  );
}

const previews = {
  'holdem-lab': HoldemPreview,
  blackjack: BlackjackPreview,
  'signal-pulse': PulsePreview,
  sudoku: SudokuPreview,
  yahtzee: DicePreview,
  stud: StudPreview,
  'circuit-repair': CircuitPreview,
  'mech-sweeper': SweeperPreview,
};

export function GameRoom({ fromExplore = false }: { fromExplore?: boolean }) {
  return (
    <main className="games-shell game-room">
      <GamesHeader fromExplore={fromExplore} />
      <div className="game-room-intro">
        <span className="games-overline">
          <Gamepad2 size={16} strokeWidth={1.5} aria-hidden="true" /> THE ARCADE
        </span>
        <h1>来一局，换换脑子。</h1>
        <p>
          打牌、掷骰、接线路、排查故障，或者安静解一道数独。选一个喜欢的，随时开始。
        </p>
      </div>
      <section className="game-room-selection" aria-label="选择游戏">
        {GAMES.map((game, index) => {
          const Preview = previews[game.id];
          return (
            <a
              className={`room-game room-game-${game.id}`}
              href={`${game.href}${fromExplore ? '?from=explore' : ''}`}
              key={game.id}
            >
              <div className="room-game-preview">
                <Preview />
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
          );
        })}
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
