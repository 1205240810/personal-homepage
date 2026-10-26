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
  CalendarDays,
  Stethoscope,
} from 'lucide-react';
import { IcpFilingLink } from '@/components/icp-filing-link';
import { RecentGameMark, RecentGames } from '@/components/games/recent-games';
import { GAMES, type GameDefinition } from '@/lib/games/catalog';
import { PULSE_LEVELS } from '@/lib/pulse-puzzle';
import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/site/site-header';
import './games.css';
import './backdrop.css';

function GamesHeader({
  fromExplore = false,
  gamePage = false,
}: {
  fromExplore?: boolean;
  gamePage?: boolean;
}) {
  return (
    <SiteHeader
      current="games"
      fromExplore={fromExplore}
      label={gamePage ? '游戏导航' : '游戏室导航'}
    />
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

/** Static sketch: a 4 × 4 bay, sensor counts on the edges, two suspects. */
function FaultPreview() {
  // '!' marked fault, 'v' marked healthy, '' undecided.
  const cells = [
    'v',
    '',
    '!',
    'v',
    'v',
    'v',
    '',
    '',
    '',
    '!',
    'v',
    '',
    'v',
    '',
    '',
    'v',
  ];
  const rows = ['1', '', '1', '0'];
  const cols = ['0', '1', '1', ''];
  return (
    <div className="room-fault-preview" aria-hidden="true">
      <div className="room-preview-top">
        <span>SENSOR LOGIC / 03</span>
        <Stethoscope size={18} strokeWidth={1.4} />
      </div>
      <div className="room-fault-bay">
        <div className="room-fault-grid">
          {cells.map((cell, index) => (
            <span
              key={index}
              className={
                cell === '!' ? 'is-fault' : cell === 'v' ? 'is-ok' : ''
              }
            >
              {cell === '!' ? '!' : cell === 'v' ? '✓' : ''}
            </span>
          ))}
        </div>
        <div className="room-fault-rows">
          {rows.map((n, i) => (
            <i key={i}>{n}</i>
          ))}
        </div>
        <div className="room-fault-cols">
          {cols.map((n, i) => (
            <i key={i}>{n}</i>
          ))}
        </div>
      </div>
      <div className="room-preview-bottom">
        <span>UNIQUE ANSWER / DAILY</span>
        <span>比对读数，锁定故障</span>
      </div>
    </div>
  );
}

function LifePreview() {
  // A glider beside a blinker on a small grid.
  const live = new Set([2, 13, 21, 22, 23, 36, 37, 38]);
  return (
    <div className="room-life-preview" aria-hidden="true">
      <div className="room-preview-top">
        <span>B3/S23 / GEN 042</span>
        <span>POP 08</span>
      </div>
      <div className="room-life-grid">
        {Array.from({ length: 48 }, (_, i) => (
          <span key={i} className={live.has(i) ? 'is-live' : ''} />
        ))}
      </div>
      <div className="room-preview-bottom">
        <span>SANDBOX / DAILY</span>
        <span>画几个格子，看它活</span>
      </div>
    </div>
  );
}

function LangtonPreview() {
  const black = new Set([
    9, 10, 16, 17, 19, 22, 24, 25, 27, 30, 33, 34, 35, 38, 41, 42, 46, 50,
  ]);
  return (
    <div className="room-langton-preview" aria-hidden="true">
      <div className="room-preview-top">
        <span>RULE RL / STEP 11000</span>
        <span>ANTS 01</span>
      </div>
      <div className="room-langton-grid">
        {Array.from({ length: 64 }, (_, i) => (
          <span
            key={i}
            className={i === 27 ? 'is-ant' : black.has(i) ? 'is-on' : ''}
          />
        ))}
      </div>
      <div className="room-preview-bottom">
        <span>HIGHWAY / 104</span>
        <span>左转右转，自成道路</span>
      </div>
    </div>
  );
}

function SandPreview() {
  const rows = [
    '........',
    '...s....',
    '..ss...w',
    '.ssss.ww',
    'ssssswww',
    '########',
  ];
  return (
    <div className="room-sand-preview" aria-hidden="true">
      <div className="room-preview-top">
        <span>PARTICLES / 240×160</span>
        <span>SAND · WATER · FIRE</span>
      </div>
      <div className="room-sand-grid">
        {rows
          .join('')
          .split('')
          .map((c, i) => (
            <span
              key={i}
              className={`is-${c === '.' ? 'e' : c === '#' ? 'h' : c}`}
            />
          ))}
      </div>
      <div className="room-preview-bottom">
        <span>BRUSH / SAVE</span>
        <span>沙会堆坡，水会摊平</span>
      </div>
    </div>
  );
}

function LaserPreview() {
  return (
    <div className="room-laser-preview" aria-hidden="true">
      <div className="room-preview-top">
        <span>BEAM / 3 TARGETS</span>
        <span>★★☆</span>
      </div>
      <svg className="room-laser-svg" viewBox="0 0 6 4">
        <polyline points="0.5,3.5 3.5,3.5 3.5,0.5 5.5,0.5" />
        <line className="m" x1="3.2" y1="3.8" x2="3.8" y2="3.2" />
        <line className="m" x1="3.2" y1="0.2" x2="3.8" y2="0.8" />
        <circle cx="2" cy="3.5" r="0.22" />
        <circle cx="3.5" cy="2" r="0.22" />
        <circle cx="5" cy="0.5" r="0.22" />
      </svg>
      <div className="room-preview-bottom">
        <span>MIRRORS / SPLITTERS</span>
        <span>让光点亮每个目标</span>
      </div>
    </div>
  );
}

function FlowPreview() {
  return (
    <div className="room-flow-preview" aria-hidden="true">
      <div className="room-preview-top">
        <span>FLOW / 5×5</span>
        <span>3/4</span>
      </div>
      <svg className="room-flow-svg" viewBox="0 0 5 5">
        <polyline stroke="#e6194b" points="0.5,0.5 3.5,0.5 3.5,1.5" />
        <polyline stroke="#3cb44b" points="0.5,1.5 0.5,4.5 2.5,4.5" />
        <polyline stroke="#4363d8" points="4.5,0.5 4.5,4.5 3.5,4.5" />
        <polyline stroke="#f58231" points="1.5,1.5 2.5,1.5 2.5,3.5" />
      </svg>
      <div className="room-preview-bottom">
        <span>FILL EVERY CELL</span>
        <span>同色相连，铺满棋盘</span>
      </div>
    </div>
  );
}

function HashiPreview() {
  return (
    <div className="room-hashi-preview" aria-hidden="true">
      <div className="room-preview-top">
        <span>HASHI / 7×7</span>
        <span>UNIQUE</span>
      </div>
      <svg className="room-hashi-svg" viewBox="0 0 5 4">
        <line x1="0.5" y1="0.5" x2="3.5" y2="0.5" />
        <line
          x1="0.5"
          y1="0.42"
          x2="0.5"
          y2="3.5"
          transform="translate(-0.08 0)"
        />
        <line
          x1="0.5"
          y1="0.5"
          x2="0.5"
          y2="3.5"
          transform="translate(0.08 0)"
        />
        <line x1="3.5" y1="0.5" x2="3.5" y2="2.5" />
        <line x1="0.5" y1="3.5" x2="4.5" y2="3.5" />
        {[
          [0.5, 0.5, 3],
          [3.5, 0.5, 2],
          [0.5, 3.5, 3],
          [3.5, 2.5, 1],
          [4.5, 3.5, 1],
        ].map(([x, y, n]) => (
          <g key={`${x}-${y}`}>
            <circle cx={x} cy={y} r="0.3" />
            <text x={x} y={y + 0.11}>
              {n}
            </text>
          </g>
        ))}
      </svg>
      <div className="room-preview-bottom">
        <span>BRIDGES / DAILY</span>
        <span>架桥连岛，不许交叉</span>
      </div>
    </div>
  );
}

function MazePreview() {
  return (
    <div className="room-maze-preview" aria-hidden="true">
      <div className="room-preview-top">
        <span>MAZE / WILSON</span>
        <span>00:24.6</span>
      </div>
      <svg className="room-maze-svg" viewBox="0 0 6 6">
        <path d="M0 0H6V6H0Z M1 0V2H3 M2 1H5V3 M0 3H2V5 M1 4H1 M3 2V5H5 M4 4V6 M5 3H6 M2 5H3" />
        <polyline className="trail" points="0.5,0.5 0.5,2.5 2.5,2.5 2.5,4.5" />
        <circle cx="2.5" cy="4.5" r="0.3" />
      </svg>
      <div className="room-preview-bottom">
        <span>4 ALGORITHMS / DAILY</span>
        <span>看它长出来，再冲出去</span>
      </div>
    </div>
  );
}

function RuleWordsPreview() {
  return (
    <div className="room-rw-preview" aria-hidden="true">
      <div className="room-preview-top">
        <span>RULE / WORDS</span>
        <span>12 LEVELS</span>
      </div>
      <div className="room-rw-rules">
        <span>机甲</span>
        <span className="is">是</span>
        <span className="prop">你</span>
        <span>墙</span>
        <span className="is">是</span>
        <span className="prop off">挡</span>
      </div>
      <div className="room-preview-bottom">
        <span>PUSH THE WORDS</span>
        <span>规则也是方块</span>
      </div>
    </div>
  );
}

function TimeLoopPreview() {
  return (
    <div className="room-tl-preview" aria-hidden="true">
      <div className="room-preview-top">
        <span>TIME LOOP</span>
        <span>LOOP 3/3</span>
      </div>
      <div className="room-tl-row">
        <i className="ghost">1</i>
        <i className="ghost">2</i>
        <i className="door" />
        <i className="me">你</i>
        <i className="exit">出</i>
      </div>
      <div className="room-preview-bottom">
        <span>RECORD / REPLAY</span>
        <span>和过去的自己合作</span>
      </div>
    </div>
  );
}

function ChessPreview() {
  return (
    <div className="room-chess-preview" aria-hidden="true">
      <div className="room-preview-top">
        <span>CHESS / ALPHA-BETA</span>
        <span>Qb8+!</span>
      </div>
      <div className="room-chess-board">
        {Array.from({ length: 16 }, (_, i) => (
          <i key={i} className={(i + Math.floor(i / 4)) % 2 ? 'd' : ''}>
            {
              [
                '♜',
                '',
                '',
                '♚',
                '',
                '♟',
                '',
                '',
                '',
                '',
                '♛',
                '',
                '♔',
                '',
                '',
                '♖',
              ][i]
            }
          </i>
        ))}
      </div>
      <div className="room-preview-bottom">
        <span>10 LEVELS / 28 PUZZLES + 2</span>
        <span>后台线程思考</span>
      </div>
    </div>
  );
}

function GoPreview() {
  return (
    <div className="room-go-preview" aria-hidden="true">
      <div className="room-preview-top">
        <span>GO / MCTS</span>
        <span>9 · 13 · 19</span>
      </div>
      <div className="room-go-board">
        {[
          [1, 1, 'b'],
          [2, 1, 'w'],
          [1, 2, 'w'],
          [3, 2, 'b'],
          [2, 3, 'b'],
          [3, 3, 'w'],
        ].map(([x, y, c]) => (
          <i
            key={`${x}${y}`}
            className={c as string}
            style={{
              left: `${(x as number) * 25}%`,
              top: `${(y as number) * 25}%`,
            }}
          />
        ))}
      </div>
      <div className="room-preview-bottom">
        <span>TSUMEGO × 29</span>
        <span>点眼、做活、接不归</span>
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
  'fault-finder': FaultPreview,
  life: LifePreview,
  langton: LangtonPreview,
  sand: SandPreview,
  laser: LaserPreview,
  flow: FlowPreview,
  hashi: HashiPreview,
  maze: MazePreview,
  rulewords: RuleWordsPreview,
  timeloop: TimeLoopPreview,
  chess: ChessPreview,
  go: GoPreview,
};

function DailyChallenges({ fromExplore }: { fromExplore: boolean }) {
  const daily = GAMES.filter((game) => game.daily);
  if (!daily.length) return null;
  return (
    <section className="room-daily" aria-labelledby="room-daily-title">
      <h2 id="room-daily-title">
        <CalendarDays size={15} strokeWidth={1.6} aria-hidden="true" />
        今日挑战
      </h2>
      <p>按日期生成，每天零点换新题；和朋友比同一张。</p>
      <ul>
        {daily.map((game) => (
          <li key={game.id}>
            <a href={`${game.href}${fromExplore ? '?from=explore' : ''}`}>
              <strong>{game.title}</strong>
              <span>{game.daily}</span>
              <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </section>
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
        <p>
          打牌、掷骰、接线路、排查故障，或者安静解一道数独。选一个喜欢的，随时开始。
        </p>
      </div>
      <div className="room-shortcuts">
        <DailyChallenges fromExplore={fromExplore} />
        <RecentGames fromExplore={fromExplore} />
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
      <RecentGameMark gameId={game.id} />
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
