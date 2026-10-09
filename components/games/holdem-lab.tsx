'use client';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
/* oxlint-disable nextjs/no-html-link-for-pages -- Full navigation isolates the game lifecycle. */
/* oxlint-disable nextjs/no-img-element -- Local game portraits use direct assets with a graceful fallback. */
import {
  ArrowRight,
  ArrowLeft,
  Maximize2,
  Minimize2,
  Settings2,
  MessageCircle,
  X,
  BookOpen,
  Check,
  ChevronDown,
  Cpu,
  LoaderCircle,
  Music2,
  Pause,
  Play,
  RotateCcw,
  Spade,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  CARD_SUITS,
  cardLabel,
  cardRank,
  cardSuit,
} from '@/lib/games/holdem-cards';
import {
  act,
  actionLabel,
  legalActions,
  potSize,
  startHand,
  tableSeats,
  DEFAULT_TABLE_CONFIG,
  validateTableConfig,
  STREET_LABELS,
  type HoldemState,
  type PokerAction,
  type Seat,
  type TableConfig,
} from '@/lib/games/holdem-engine';
import {
  AI_DIFFICULTIES,
  BOT_STYLES,
  DEFAULT_SEAT_STYLES,
  REVIEW_SAMPLES,
  decideBotSteps,
  nextButton,
  pct,
  positionLabel,
  reviewHandSteps,
  type AiDifficulty,
  type BotStyle,
  type ReviewPoint,
} from '@/lib/games/holdem-strategy';
import { HoldemWorkerClient } from '@/lib/games/holdem-worker-client';
import holdemWorkerUrl from './holdem-worker.ts?worker&url';
import { runCooperative } from '@/lib/games/cooperative-computation';
import { HoldemLoungeMusic } from '@/lib/games/holdem-music';
import {
  createTableReplay,
  validateTableReplay,
  validateReplayAction,
  type BotDecisionTrace,
  type ReplayAction,
  type TableReplay,
} from '@/lib/games/holdem-replay';
import {
  announcePoker,
  pokerVoiceBusy,
  pokerVoiceAvailability,
  stopPokerVoice,
} from '@/lib/games/holdem-voice';
import './holdem-lab.css';

type StoredHand = {
  hand: number;
  delta: number;
  hero: number[];
  board: number[];
  points: ReviewPoint[];
  difficulty: AiDifficulty;
  config?: TableConfig;
  reviewVersion?: 2;
  tableReplay?: TableReplay;
};
type Practice = {
  hands: number;
  wins: number;
  net: number;
  recent: StoredHand[];
};
const EMPTY_PRACTICE: Practice = { hands: 0, wins: 0, net: 0, recent: [] };
// Five-seat analysis has a different model; preserve the original v1 records untouched.
const STORAGE_KEY = 'tscjj:holdem-practice:v2';
const SETTINGS_KEY = 'tscjj:holdem-settings:v2';
const MAX_PRACTICE_BYTES = 2_000_000;
const SEAT_NAMES = [
  '你',
  '循环',
  '灯塔',
  '疾风',
  '帷幕',
  '余弦',
  '松石',
  '北辰',
  '流光',
];
const STYLES: BotStyle[] = [...DEFAULT_SEAT_STYLES];
type ConfigDraft = Record<keyof TableConfig, string>;
const configDraft = (config: TableConfig): ConfigDraft => ({
  tableSize: String(config.tableSize),
  smallBlind: String(config.smallBlind),
  bigBlind: String(config.bigBlind),
  initialStack: String(config.initialStack),
});
const numericConfig = (draft: ConfigDraft): TableConfig => ({
  tableSize: Number(draft.tableSize),
  smallBlind: Number(draft.smallBlind),
  bigBlind: Number(draft.bigBlind),
  initialStack: Number(draft.initialStack),
});
const sameTableConfig = (first: TableConfig, second: TableConfig) =>
  first.tableSize === second.tableSize &&
  first.smallBlind === second.smallBlind &&
  first.bigBlind === second.bigBlind &&
  first.initialStack === second.initialStack;
type Job =
  | {
      type: 'bot';
      state: HoldemState;
      seat: Seat;
      style: BotStyle;
      difficulty: AiDifficulty;
      styles: BotStyle[];
    }
  | {
      type: 'review';
      state: HoldemState;
      difficulty: AiDifficulty;
      styles: BotStyle[];
    };

function PlayingCard({
  card,
  hidden = false,
  small = false,
}: {
  card?: number;
  hidden?: boolean;
  small?: boolean;
}) {
  if (hidden || card === undefined)
    return (
      <span
        className={`poker-card is-back ${small ? 'is-small' : ''}`}
        aria-label="未亮出的牌"
      >
        <Spade size={small ? 13 : 22} aria-hidden="true" />
      </span>
    );
  const rank = cardRank(card);
  const suit = cardSuit(card);
  const face = rank > 10 ? ['J', 'Q', 'K', 'A'][rank - 11] : String(rank);
  return (
    <span
      className={`poker-card ${suit === 1 || suit === 3 ? 'is-red' : ''} ${small ? 'is-small' : ''}`}
      aria-label={cardLabel(card)}
    >
      <span className="poker-card-corner" aria-hidden="true">
        {face}
        <small>{CARD_SUITS[suit]}</small>
      </span>
      <span className="poker-card-suit" aria-hidden="true">
        {CARD_SUITS[suit]}
      </span>
    </span>
  );
}

function usePokerWorker() {
  const client = useRef<HoldemWorkerClient<Job> | null>(null);
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    const instance = new HoldemWorkerClient<Job>({
      // RSC transforms import.meta.url before the client bundle. Import the
      // compiled asset URL explicitly so it never inherits a file: base URL.
      createWorker: () => new Worker(holdemWorkerUrl, { type: 'module' }),
      computeFallback: (job, signal) =>
        job.type === 'bot'
          ? runCooperative(
              decideBotSteps(
                job.state,
                job.seat,
                job.style,
                job.difficulty,
                job.styles,
              ),
              signal,
            )
          : runCooperative(
              reviewHandSteps(
                job.state,
                REVIEW_SAMPLES[job.difficulty],
                undefined,
                job.styles,
              ),
              signal,
            ),
      onModeChange: (mode) => setFallback(mode === 'fallback'),
    });
    client.current = instance;
    return () => {
      client.current = null;
      instance.dispose();
    };
  }, []);
  const getStrategy = useCallback(
    <T,>(job: Job, signal: AbortSignal): Promise<T> => {
      if (!client.current) return Promise.reject(new Error('计算线程尚未就绪'));
      return client.current.request<T>(job, signal);
    },
    [],
  );
  return { getStrategy, fallback };
}

const validCards = (cards: unknown): cards is number[] =>
  Array.isArray(cards) &&
  cards.every((c) => Number.isInteger(c) && c >= 0 && c < 52);
function validExplanation(value: ReviewPoint['explanations']) {
  return (
    value === undefined ||
    Boolean(
      value &&
      [
        value.conclusion,
        value.purpose,
        value.sizing,
        value.nextQuestion,
        value.gtoContext,
      ].every((text) => typeof text === 'string') &&
      Array.isArray(value.reasons) &&
      value.reasons.every((text) => typeof text === 'string') &&
      Array.isArray(value.alternatives) &&
      value.alternatives.every((text) => typeof text === 'string'),
    )
  );
}
function storedReplay(hand: StoredHand): TableReplay | undefined {
  const replay = hand.tableReplay;
  if (!validateTableReplay(replay)) return undefined;
  const sameCards = (a: number[], b: number[]) =>
    a.length === b.length && a.every((card, i) => card === b[i]);
  if (
    replay.hand !== hand.hand ||
    !sameCards(replay.holes[0], hand.hero) ||
    !sameCards(replay.board, hand.board) ||
    replay.stacks[0] - replay.startingStacks[0] !== hand.delta ||
    (hand.config &&
      (replay.tableSize !== hand.config.tableSize ||
        replay.smallBlind !== hand.config.smallBlind ||
        replay.bigBlind !== hand.config.bigBlind))
  )
    return undefined;
  return replay;
}
function readPractice(): Practice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (
      !raw ||
      raw.length > MAX_PRACTICE_BYTES ||
      new TextEncoder().encode(raw).length > MAX_PRACTICE_BYTES
    )
      return EMPTY_PRACTICE;
    const saved = JSON.parse(raw) as Practice;
    if (
      !Number.isSafeInteger(saved.hands) ||
      saved.hands < 0 ||
      !Number.isSafeInteger(saved.wins) ||
      saved.wins < 0 ||
      saved.wins > saved.hands ||
      !Number.isFinite(saved.net) ||
      !Array.isArray(saved.recent)
    )
      return EMPTY_PRACTICE;
    return {
      ...saved,
      recent: saved.recent
        .slice(0, 8)
        .filter(
          (h) =>
            h &&
            Number.isFinite(h.delta) &&
            Number.isInteger(h.hand) &&
            validCards(h.hero) &&
            h.hero.length === 2 &&
            validCards(h.board) &&
            h.board.length <= 5 &&
            typeof h.difficulty === 'string' &&
            Object.hasOwn(AI_DIFFICULTIES, h.difficulty) &&
            (h.config === undefined ||
              validateTableConfig(h.config) === null) &&
            Array.isArray(h.points) &&
            h.points.length <= 100 &&
            h.points.every(
              (p) =>
                p &&
                Number.isFinite(p.score) &&
                p.score >= 0 &&
                p.score <= 100 &&
                Number.isFinite(p.equity) &&
                typeof p.advice === 'string' &&
                typeof p.principle === 'string' &&
                typeof p.title === 'string' &&
                typeof p.action === 'string' &&
                (p.scoreGapBB === undefined ||
                  (Number.isFinite(p.scoreGapBB) && p.scoreGapBB >= 0)) &&
                (p.comparison === undefined ||
                  ['clear', 'close', 'sensitive'].includes(p.comparison)) &&
                (p.scoreReference === undefined ||
                  (p.scoreReference &&
                    typeof p.scoreReference.label === 'string' &&
                    Number.isFinite(p.scoreReference.evBB) &&
                    validateReplayAction(p.scoreReference.action))) &&
                validExplanation(p.explanations) &&
                typeof p.street === 'string' &&
                Object.hasOwn(STREET_LABELS, p.street) &&
                [
                  p.spr,
                  p.regretBB,
                  p.uncertaintyBB,
                  p.pot,
                  p.call,
                  p.samples,
                  p.opponents,
                ].every(Number.isFinite) &&
                (p.modelAllowanceBB === undefined ||
                  (Number.isFinite(p.modelAllowanceBB) &&
                    p.modelAllowanceBB >= 0)) &&
                typeof p.position === 'string' &&
                typeof p.model === 'string' &&
                ['low', 'medium'].includes(p.confidence) &&
                validCards(p.board) &&
                p.board.length <= 5 &&
                Array.isArray(p.alternatives) &&
                p.alternatives.length > 0 &&
                p.alternatives.every(
                  (a) =>
                    a &&
                    [a.evBB, a.standardErrorBB, a.score].every(
                      Number.isFinite,
                    ) &&
                    typeof a.label === 'string' &&
                    typeof a.reason === 'string',
                ) &&
                p.recommendation &&
                typeof p.recommendation.label === 'string' &&
                Number.isFinite(p.recommendation.evBB) &&
                Array.isArray(p.rangeNotes) &&
                p.rangeNotes.every((note) => typeof note === 'string') &&
                Array.isArray(p.limitations) &&
                p.limitations.every((note) => typeof note === 'string'),
            ),
        )
        .map((hand) => {
          const tableReplay = storedReplay(hand);
          return {
            hand: hand.hand,
            delta: hand.delta,
            hero: hand.hero,
            board: hand.board,
            points: hand.points,
            difficulty: hand.difficulty,
            config: hand.config,
            reviewVersion: hand.reviewVersion === 2 ? 2 : undefined,
            ...(tableReplay ? { tableReplay } : {}),
          };
        }),
    };
  } catch {
    return EMPTY_PRACTICE;
  }
}

function boundedPractice(practice: Practice) {
  const recent = practice.recent.slice(0, 8);
  let value = { ...practice, recent };
  let serialized = JSON.stringify(value);
  while (
    recent.length &&
    new TextEncoder().encode(serialized).length > MAX_PRACTICE_BYTES
  ) {
    recent.pop();
    value = { ...practice, recent: [...recent] };
    serialized = JSON.stringify(value);
  }
  return {
    value,
    serialized,
    trimmed: recent.length !== practice.recent.length,
  };
}

function seatPosition(seat: Seat, count: number) {
  const angle = Math.PI / 2 + (Math.PI * 2 * seat) / count;
  return { x: 50 + Math.cos(angle) * 39, y: 50 + Math.sin(angle) * 34 };
}

function mobileSeatPosition(seat: Seat, count: number) {
  if (seat === 0) return { x: 50, y: 90 };
  if (count === 2) return { x: 50, y: 13 };
  if (count === 4)
    return seat === 2 ? { x: 50, y: 13 } : { x: seat === 1 ? 22 : 78, y: 31 };
  const leftCount = Math.floor((count - 1) / 2);
  const rightCount = count - 1 - leftCount;
  const rows = Math.max(leftCount, rightCount);
  const left = seat <= leftCount;
  const row = left ? rows - seat : seat - leftCount - 1;
  const base = rows >= 4 ? 8 : rows === 3 ? 11 : 14;
  const spacing = rows >= 4 ? 14 : rows === 3 ? 17 : 18;
  return {
    x: !left && row === 0 && leftCount < rightCount ? 50 : left ? 23 : 77,
    y: base + row * spacing,
  };
}

function ChipStack({
  amount,
  bigBlind,
  wager = false,
}: {
  amount: number;
  bigBlind: number;
  wager?: boolean;
}) {
  if (!amount) return null;
  const piles = Math.min(
    wager ? 2 : 3,
    Math.max(1, Math.ceil(amount / (bigBlind * 50))),
  );
  const levels = Math.min(
    6,
    Math.max(2, Math.ceil(amount / (bigBlind * 10 * piles))),
  );
  return (
    <span
      className={`poker-chips ${wager ? 'is-wager' : ''}`}
      aria-hidden="true"
    >
      {Array.from({ length: piles }, (_, pile) => (
        <i className={`poker-chip-pile chip-color-${pile % 3}`} key={pile}>
          {Array.from({ length: levels }, (_, level) => (
            <b key={level} style={{ '--chip-level': level } as CSSProperties} />
          ))}
        </i>
      ))}
    </span>
  );
}

function TableSeat({
  seat,
  state,
  paused,
  config,
  calculationError,
}: {
  seat: Seat;
  state: HoldemState | null;
  paused: boolean;
  config: TableConfig;
  calculationError: boolean;
}) {
  const [missingPortrait, setMissingPortrait] = useState(false);
  const hero = seat === 0;
  const folded = Boolean(state?.folded[seat]);
  const active = state?.toAct === seat && !paused;
  const completed = state?.street === 'complete';
  const showCards =
    hero ||
    Boolean(completed && state?.result?.reason === 'showdown' && !folded);
  const winner = Boolean(state?.result?.winners.includes(seat));
  const allIn = state && !completed && !folded && state.stacks[seat] === 0;
  const latest = state?.actions.findLast((d) => d.seat === seat);
  const position = seatPosition(seat, config.tableSize);
  const mobile = mobileSeatPosition(seat, config.tableSize);
  const stack = state?.stacks[seat] ?? config.initialStack;
  return (
    <div
      className={`poker-seat poker-seat-${seat} ${hero ? 'is-hero' : ''} ${folded ? 'is-folded' : ''} ${active ? 'is-acting' : ''} ${winner ? 'is-winner' : ''}`}
      style={
        {
          '--seat-x': `${position.x}%`,
          '--seat-y': `${position.y}%`,
          '--mobile-x': `${mobile.x}%`,
          '--mobile-y': `${mobile.y}%`,
        } as CSSProperties
      }
      aria-label={`${SEAT_NAMES[seat]}席位${active ? '，正在行动' : ''}${folded ? '，已弃牌' : ''}`}
    >
      <div className="poker-person-window">
        {!missingPortrait ? (
          <img
            src={`/assets/poker/portraits/seat-${seat}.webp`}
            alt=""
            onError={() => setMissingPortrait(true)}
            draggable={false}
          />
        ) : (
          <span className="poker-portrait-fallback">
            <Cpu size={35} strokeWidth={1.2} />
          </span>
        )}
        <span className="poker-actor-halo" />
      </div>
      <div className="poker-seat-identity">
        <div>
          <strong>
            {SEAT_NAMES[seat]}
            {state?.button === seat && (
              <i className="poker-dealer" title="按钮位" aria-label="按钮位">
                D
              </i>
            )}
          </strong>
          <small>
            {state
              ? positionLabel(state, seat)
              : hero
                ? '你的席位'
                : `AI ${seat}`}{' '}
            · {hero ? '玩家' : BOT_STYLES[STYLES[seat] ?? 'balanced'].label}
          </small>
        </div>
        <b className="poker-seat-stack">
          {stack.toLocaleString()}
          <small>筹码</small>
        </b>
      </div>
      <div className="poker-seat-bottom">
        <div className="poker-hole" aria-label={`${SEAT_NAMES[seat]}的手牌`}>
          {(state?.holes[seat] ?? [undefined, undefined]).map((c, i) => (
            <PlayingCard
              key={`${state?.hand ?? 0}-${c ?? i}`}
              card={c}
              hidden={!showCards || c === undefined}
              small={!hero}
            />
          ))}
        </div>
        <ChipStack amount={stack} bigBlind={config.bigBlind} />
      </div>
      <div className="poker-seat-state">
        <span>
          {folded
            ? '已弃牌'
            : allIn
              ? '全下'
              : winner
                ? `赢得 ${state?.result?.payouts[seat]}`
                : active
                  ? hero
                    ? '轮到你'
                    : calculationError
                      ? '等待重试'
                      : '思考中…'
                  : latest
                    ? actionLabel(latest)
                    : '准备就绪'}
        </span>
        {completed && showCards && state?.result?.labels[seat] ? (
          <small>{state.result.labels[seat]}</small>
        ) : null}
      </div>
      {state?.streetBets[seat] && !completed ? (
        <div className="poker-seat-wager">
          <ChipStack
            amount={state.streetBets[seat]}
            bigBlind={config.bigBlind}
            wager
          />
          <span>{state.streetBets[seat]}</span>
        </div>
      ) : null}
    </div>
  );
}

function ReviewCard({
  point,
  first,
  legacy = false,
}: {
  point: ReviewPoint;
  first: boolean;
  legacy?: boolean;
}) {
  const sensitive = point.scoreSensitive || point.comparison === 'sensitive';
  const grade = sensitive
    ? 'sensitive'
    : point.score >= 85
      ? 'good'
      : point.score >= 60
        ? 'mixed'
        : 'costly';
  const selected = point.alternatives.find((a) => a.label === point.action);
  return (
    <details className={`poker-review-point grade-${grade}`} open={first}>
      <summary>
        <span className="poker-review-score">
          <b>{sensitive ? '待评' : point.score.toFixed(1)}</b>
          <small>
            {sensitive ? '估值敏感' : legacy ? '旧模型评分' : '模型评分'}
          </small>
        </span>
        <span className="poker-review-title">
          <small>
            {STREET_LABELS[point.street]} · {point.position} · {point.opponents}{' '}
            位对手
          </small>
          <strong>{point.action}</strong>
          <span>{point.title}</span>
        </span>
        <ChevronDown size={17} />
      </summary>
      <div className="poker-review-body">
        <div className="poker-decision-board">
          <span>决策时公共牌</span>
          {point.board.length ? (
            point.board.map((card) => (
              <PlayingCard card={card} key={card} small />
            ))
          ) : (
            <small>翻牌前，尚未发出</small>
          )}
        </div>
        <div className="poker-review-recommendation">
          <span>{legacy ? '模型推荐' : '稳健推荐'}</span>
          <strong>{point.recommendation.label}</strong>
          <small>
            {legacy ? '旧模型候选差值' : '与常规数值参照的原始 EV 差'}{' '}
            {(point.scoreGapBB ?? point.regretBB).toFixed(2)} BB · 模型置信度
            {point.confidence === 'medium' ? '中' : '低'}
          </small>
        </div>
        {point.scoreReference && !legacy && (
          <p className="poker-score-reference">
            数值参照：<strong>{point.scoreReference.label}</strong> · 候选 EV{' '}
            {point.scoreReference.evBB >= 0 ? '+' : ''}
            {point.scoreReference.evBB.toFixed(2)} BB。
            {point.scoreReference.label === point.recommendation.label
              ? '它同时也是本次稳健推荐。'
              : '它用于计算数分；稳健推荐另考虑抽样接近、模型敏感性和投入尺度。'}
          </p>
        )}
        {sensitive && (
          <p className="poker-score-sensitive">
            这个尺度远超当前可争夺底池，估值对对手继续范围非常敏感。
            暂不评分；建议先参考较稳定的常规尺度。
          </p>
        )}
        {!sensitive && !legacy && point.comparison && (
          <p className="poker-score-comparison">
            原始 EV 差 {(point.scoreGapBB ?? point.regretBB).toFixed(2)} BB ·{' '}
            {point.comparison === 'close'
              ? '抽样接近：分数仍按原始差值计算，不能据此断言动作完全等价。'
              : '在当前抽样与模型预留下可辨认差异。'}
          </p>
        )}
        {point.explanations ? (
          <div className="poker-teaching">
            <h4>{point.explanations.conclusion}</h4>
            <ol>
              {point.explanations.reasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ol>
            <section>
              <h5>这一步要达到什么目的</h5>
              <p>{point.explanations.purpose}</p>
            </section>
            <section>
              <h5>尺度怎么选</h5>
              <p>{point.explanations.sizing}</p>
            </section>
            <section>
              <h5>为什么没有推荐其他动作</h5>
              {point.explanations.alternatives.map((alternative, i) => (
                <p key={i}>{alternative}</p>
              ))}
            </section>
            <p className="poker-next-question">
              下一次先问：{point.explanations.nextQuestion}
            </p>
            <section>
              <h5>放回完整范围中理解</h5>
              <p>{point.explanations.gtoContext}</p>
            </section>
          </div>
        ) : (
          <p>{point.advice}</p>
        )}
        <div className="poker-review-metrics">
          <span>
            公开范围摊牌份额 <b>{pct(point.equity)}</b>
          </span>
          {point.threshold !== null && (
            <span>
              静态跟注门槛 <b>{pct(point.threshold)}</b>
            </span>
          )}
          <span>
            底池 <b>{point.pot}</b>
          </span>
          <span>
            SPR <b>{point.spr.toFixed(1)}</b>
          </span>
        </div>
        <div className="poker-candidate-wrap">
          <table className="poker-candidates">
            <caption>
              候选模型 EV 比较{' '}
              <small>单位 BB，比较的是当前决策之后的估计净值</small>
            </caption>
            <thead>
              <tr>
                <th scope="col">行动</th>
                <th scope="col">模型 EV</th>
                <th scope="col">评分</th>
              </tr>
            </thead>
            <tbody>
              {point.alternatives.map((option, i) => (
                <tr
                  key={i}
                  className={[
                    option === selected ? 'is-selected' : '',
                    option.label === point.recommendation.label
                      ? 'is-recommended'
                      : '',
                    option.label === point.scoreReference?.label && !legacy
                      ? 'is-reference'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <th scope="row">
                    {option.label}
                    {option.label === point.action && <small>你的选择</small>}
                    {option.label === point.recommendation.label && (
                      <small>{legacy ? '模型推荐' : '稳健推荐'}</small>
                    )}
                    {option.label === point.scoreReference?.label &&
                      !legacy && <small>数值参照</small>}
                  </th>
                  <td>
                    {option.evBB >= 0 ? '+' : ''}
                    {option.evBB.toFixed(1)}
                    <small>±{option.standardErrorBB.toFixed(1)}</small>
                  </td>
                  <td>
                    {option.scoreSensitive ? '—' : option.score.toFixed(1)}
                    {option.scoreSensitive && <small>暂不评分</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {point.scoreReference && !legacy && (
          <p className="poker-candidate-legend">
            你的选择是已执行的动作；数值参照是常规候选中的最高估计
            EV；稳健推荐可能选较少投入、估值接近的动作。
          </p>
        )}
        <details className="poker-model-details">
          <summary>
            候选动作的思路 <ChevronDown size={14} />
          </summary>
          <ul>
            {point.alternatives.map((option, i) => (
              <li key={i}>
                <strong>{option.label}</strong>：{option.reason}
              </li>
            ))}
          </ul>
        </details>
        <p className="poker-principle">{point.principle}</p>
        {point.rangeNotes.length > 0 && (
          <details className="poker-model-details">
            <summary>
              对手范围与推导依据 <ChevronDown size={14} />
            </summary>
            <ul>
              {point.rangeNotes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </details>
        )}
        <details className="poker-model-details">
          <summary>
            抽样误差与模型限制 <ChevronDown size={14} />
          </summary>
          <p>
            {point.model}，{point.samples} 次抽样；候选差值抽样误差约 ±
            {point.uncertaintyBB.toFixed(1)} BB。表内 ±
            值为抽样标准误，不包含模型误差。
          </p>
          {point.modelAllowanceBB !== undefined && (
            <p>
              {legacy ? '旧模型评分与推荐' : '动作差异判断与稳健推荐'}另留{' '}
              {point.modelAllowanceBB.toFixed(1)} BB 的模型敏感性空间；
              {legacy
                ? '旧评分可能受这项预留影响。'
                : '新版数分仍按原始 EV 差计算，不扣除这项预留。'}
              它是启发式预留，并非统计置信区间。
            </p>
          )}
          <ul>
            {point.limitations.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </details>
      </div>
    </details>
  );
}

function safeTableReplay(state: HoldemState): TableReplay | undefined {
  if (state.street !== 'complete' || !state.result) return undefined;
  try {
    return createTableReplay(state);
  } catch {
    return undefined;
  }
}

const INTENT_NAMES: Record<string, string> = {
  value: '价值下注',
  steal: '争夺位置底池',
  continuation: '持续下注',
  'semi-bluff': '半诈唬',
  bluff: '选择性诈唬',
  'price-call': '按价格防守',
  'loose-call': '宽范围跟注',
  'price-fold': '价格不利时弃牌',
  check: '控制底池',
  'ev-call': '价格校验后跟注',
  'ev-fold': '价格校验后弃牌',
};
function traceActionLabel(action: PokerAction, call: number) {
  if (action.type === 'raise') return `加注到 ${action.to}`;
  return action.type === 'fold'
    ? '弃牌'
    : action.type === 'check'
      ? '过牌'
      : `跟注 ${call}`;
}

function RecordedBotTrace({ trace }: { trace: BotDecisionTrace }) {
  const mixed = trace.mixing;
  return (
    <div className="poker-trace">
      <div className="poker-trace-heading">
        <span>实际执行目的</span>
        <strong>{INTENT_NAMES[trace.selectedIntent] ?? '本地混合策略'}</strong>
        <small>
          {BOT_STYLES[trace.style].label} ·{' '}
          {AI_DIFFICULTIES[trace.difficulty].label}
        </small>
      </div>
      <div className="poker-decision-board">
        <span>它当时的底牌</span>
        {trace.hole.map((card) => (
          <PlayingCard key={card} card={card} small />
        ))}
        <span>当时公共牌</span>
        {trace.board.length ? (
          trace.board.map((card) => (
            <PlayingCard key={card} card={card} small />
          ))
        ) : (
          <small>尚未发出</small>
        )}
      </div>
      <div className="poker-trace-metrics">
        <span>
          决策前底池 <b>{(trace.pot / trace.bigBlind).toFixed(1)} BB</b>
        </span>
        <span>
          跟注价格 <b>{(trace.call / trace.bigBlind).toFixed(1)} BB</b>
        </span>
        <span>
          {trace.position} · <b>{trace.opponents} 位对手</b>
        </span>
      </div>
      <ol className="poker-trace-reasons">
        {trace.rationale.map((reason, i) => (
          <li key={i}>{reason}</li>
        ))}
      </ol>
      <details className="poker-model-details">
        <summary>
          展开实际抽样与混合参数 <ChevronDown size={14} />
        </summary>
        <p>
          以下参数在该行动执行前记录，保留了实际使用的随机抽样。它不是事后按照已知底牌重算的解释。
        </p>
        <dl className="poker-trace-parameters">
          <div>
            <dt>范围摊牌份额</dt>
            <dd>{pct(trace.rawEquity)}</dd>
          </div>
          <div>
            <dt>可争夺筹码份额</dt>
            <dd>{pct(trace.equity)}</dd>
          </div>
          <div>
            <dt>策略调整后的份额</dt>
            <dd>{pct(mixed.adjustedEquity)}</dd>
          </div>
          <div>
            <dt>权益实现调整</dt>
            <dd>{pct(mixed.realizedEquity)}</dd>
          </div>
          <div>
            <dt>范围抽样数</dt>
            <dd>{trace.samples}</dd>
          </div>
          <div>
            <dt>实际混合随机值</dt>
            <dd>{mixed.roll.toFixed(3)}</dd>
          </div>
          <div>
            <dt>权益扰动随机值</dt>
            <dd>{mixed.equityJitterRoll.toFixed(3)}</dd>
          </div>
          <div>
            <dt>诈唬触发阈值</dt>
            <dd>{pct(mixed.bluffProbability)}</dd>
          </div>
        </dl>
        <div className="poker-trace-flags">
          <span>{mixed.inPosition ? '有后位优势' : '未处于最后行动位'}</span>
          <span>{mixed.draw > 0 ? '有听牌特征' : '无明显听牌特征'}</span>
          <span>{mixed.blocker ? '有阻断特征' : '无阻断特征'}</span>
          <span>
            {mixed.bluffEligible
              ? mixed.bluffTriggered
                ? '诈唬分支已触发'
                : '允许混合诈唬，本次未触发'
              : '本次不进入诈唬分支'}
          </span>
          {mixed.cbet && <span>持续下注条件成立</span>}
          {mixed.steal && <span>位置争夺条件成立</span>}
        </div>
        {trace.override && (
          <p className="poker-trace-override">
            跟注 EV 校验：{trace.override.callEVBB >= 0 ? '+' : ''}
            {trace.override.callEVBB.toFixed(2)} BB，预留{' '}
            {trace.override.toleranceBB.toFixed(2)} BB。
            {trace.override.changed
              ? `实际从${traceActionLabel(trace.override.from, trace.call)}改为${traceActionLabel(trace.override.to, trace.call)}。`
              : '校验保留了原策略动作。'}
          </p>
        )}
      </details>
      {trace.candidates.length > 0 && (
        <details className="poker-model-details">
          <summary>
            查看当时的候选 EV 诊断 <ChevronDown size={14} />
          </summary>
          <div className="poker-candidate-wrap">
            <table className="poker-candidates">
              <caption>
                同一批样本下的局部 EV <small>单位 BB，± 为抽样标准误</small>
              </caption>
              <thead>
                <tr>
                  <th scope="col">候选动作</th>
                  <th scope="col">估计 EV</th>
                </tr>
              </thead>
              <tbody>
                {trace.candidates.map((candidate, i) => (
                  <tr key={i}>
                    <th scope="row">
                      {traceActionLabel(candidate.action, trace.call)}
                    </th>
                    <td>
                      {candidate.evBB >= 0 ? '+' : ''}
                      {candidate.evBB.toFixed(1)}
                      <small>±{candidate.standardErrorBB.toFixed(1)}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            执行动作来自上面的风格、范围和混合规则；这组候选诊断不表示 AI
            必须选择表内最大值，也不是已求解的 GTO 频率。
          </p>
        </details>
      )}
    </div>
  );
}

function ReplayActionCard({
  action,
  replay,
  heroPoints,
  first,
  legacy,
}: {
  action: ReplayAction;
  replay: TableReplay;
  heroPoints: ReviewPoint[] | null;
  first: boolean;
  legacy: boolean;
}) {
  const heroPoint =
    action.seat === 0
      ? heroPoints?.find((point) => point.index === action.index)
      : undefined;
  return (
    <details
      className={`poker-replay-action ${action.seat === 0 ? 'is-human' : ''}`}
      open={first}
    >
      <summary>
        <span className="poker-replay-order">
          {String(action.index + 1).padStart(2, '0')}
        </span>
        <span>
          <strong>
            {SEAT_NAMES[action.seat]} <b>{actionLabel(action)}</b>
          </strong>
          <small>
            决策前底池 {action.pot} · 剩余 {action.stack}
          </small>
        </span>
        <ChevronDown size={16} />
      </summary>
      <div className="poker-replay-action-body">
        {action.seat !== 0 ? (
          action.botTrace ? (
            <RecordedBotTrace trace={action.botTrace} />
          ) : (
            <p className="poker-replay-no-trace">
              这次行动没有保存即时策略记录，无法事后重建它实际使用的抽样和随机选择。
            </p>
          )
        ) : (
          <>
            <div className="poker-decision-board">
              <span>你的底牌</span>
              {replay.holes[0].map((card) => (
                <PlayingCard card={card} key={card} small />
              ))}
              <span>当时公共牌</span>
              {action.board.length ? (
                action.board.map((card) => (
                  <PlayingCard card={card} key={card} small />
                ))
              ) : (
                <small>尚未发出</small>
              )}
            </div>
            <p className="poker-replay-information">
              这是你的实际行动。下面仍以当时公开信息评分，不使用事后揭开的 AI
              底牌。
            </p>
            {heroPoint ? (
              <ReviewCard point={heroPoint} first legacy={legacy} />
            ) : (
              <p className="poker-replay-no-trace">
                这次行动没有对应的个人决策评分。
              </p>
            )}
          </>
        )}
      </div>
    </details>
  );
}

function TableReplayView({
  replay,
  heroPoints,
  legacy,
}: {
  replay: TableReplay;
  heroPoints: ReviewPoint[] | null;
  legacy: boolean;
}) {
  const [filter, setFilter] = useState<'all' | number>('all');
  const selectedSeat =
    filter === 'all' || filter >= replay.tableSize ? 'all' : filter;
  const streets = ['preflop', 'flop', 'turn', 'river'] as const;
  const seatIds = tableSeats(replay.tableSize);
  return (
    <div className="poker-table-replay">
      <div className="poker-replay-information">
        <strong>本手已结束，现在可以看全桌底牌。</strong>
        <p>
          包括已弃牌的席位。实际 AI
          诊断只使用它当时自己的两张牌、已发公共牌和公开行动；你的评分仍使用当时的信息，不拿真实对手底牌倒推。
        </p>
      </div>
      <div className="poker-replay-board">
        <span>结束时公共牌</span>
        <div className="poker-hole">
          {replay.board.length ? (
            replay.board.map((card) => (
              <PlayingCard card={card} key={card} small />
            ))
          ) : (
            <small>翻牌前结束，未发公共牌</small>
          )}
        </div>
        <small>
          {replay.tableSize} 人桌 · 盲注 {replay.smallBlind}/{replay.bigBlind}
        </small>
      </div>
      <div className="poker-replay-seats" data-count={replay.tableSize}>
        {seatIds.map((seat) => {
          const delta = replay.stacks[seat] - replay.startingStacks[seat];
          return (
            <button
              type="button"
              className={`poker-replay-seat ${replay.folded[seat] ? 'is-folded' : ''} ${replay.result.winners.includes(seat) ? 'is-winner' : ''}`}
              key={seat}
              aria-pressed={selectedSeat === seat}
              aria-label={`查看${SEAT_NAMES[seat]}的行动`}
              onClick={() => setFilter(selectedSeat === seat ? 'all' : seat)}
            >
              <span className="poker-replay-seat-name">
                <strong>{SEAT_NAMES[seat]}</strong>
                <small>{positionLabel(replay, seat)}</small>
              </span>
              <span className="poker-hole">
                {replay.holes[seat].map((card) => (
                  <PlayingCard card={card} key={card} small />
                ))}
              </span>
              <span className="poker-replay-seat-result">
                <small>
                  {replay.folded[seat]
                    ? '已弃牌'
                    : replay.result.winners.includes(seat)
                      ? '赢得底池'
                      : '摊牌'}
                </small>
                <b>
                  {delta >= 0 ? '+' : ''}
                  {delta.toLocaleString()}
                </b>
              </span>
            </button>
          );
        })}
      </div>
      <label className="poker-replay-filter">
        <span>行动视角</span>
        <select
          value={selectedSeat}
          onChange={(event) =>
            setFilter(
              event.target.value === 'all' ? 'all' : Number(event.target.value),
            )
          }
        >
          <option value="all">全桌完整行动</option>
          {seatIds.map((seat) => (
            <option value={seat} key={seat}>
              只看{SEAT_NAMES[seat]}
            </option>
          ))}
        </select>
        <small>点击席位也能筛选</small>
      </label>
      <div className="poker-replay-streets">
        {streets
          .filter((street) =>
            replay.actions.some((action) => action.street === street),
          )
          .map((street) => {
            const allActions = replay.actions.filter(
              (action) => action.street === street,
            );
            const actions = allActions.filter(
              (action) =>
                selectedSeat === 'all' || action.seat === selectedSeat,
            );
            const board = allActions[0].board;
            return (
              <section key={street} className="poker-replay-street">
                <header>
                  <h4>{STREET_LABELS[street]}</h4>
                  <div className="poker-hole">
                    {board.map((card) => (
                      <PlayingCard key={card} card={card} small />
                    ))}
                  </div>
                  <small>{actions.length} 次行动</small>
                </header>
                {actions.length ? (
                  actions.map((action, i) => (
                    <ReplayActionCard
                      key={action.index}
                      action={action}
                      replay={replay}
                      heroPoints={heroPoints}
                      first={i === 0 && street === 'preflop'}
                      legacy={legacy}
                    />
                  ))
                ) : (
                  <p className="poker-replay-no-trace">
                    该席位在这一轮没有行动。
                  </p>
                )}
              </section>
            );
          })}
      </div>
      <details className="poker-pot-breakdown">
        <summary>
          结算明细 <ChevronDown size={14} />
        </summary>
        {replay.result.pots.map((pot, i) => (
          <p key={i}>
            {i === 0 ? '主池' : `边池 ${i}`} {pot.amount} →{' '}
            {pot.winners.map((seat) => SEAT_NAMES[seat]).join('、')}
          </p>
        ))}
        {seatIds
          .filter((seat) => replay.result.returned[seat] > 0)
          .map((seat) => (
            <p key={seat}>
              {SEAT_NAMES[seat]}未被跟注的 {replay.result.returned[seat]}{' '}
              已退回。
            </p>
          ))}
      </details>
      <p className="poker-replay-limit">
        全桌回放是事后观察；算法诊断是行动前保存的真实记录。混合随机值和局部 EV
        都来自本地近似模型，不是专业求解器的动作频率。
      </p>
    </div>
  );
}

const HAND_GUIDE = [
  ['同花顺', '同花色且连续的五张牌', '9♠ 8♠ 7♠ 6♠ 5♠'],
  ['四条', '四张点数相同的牌', 'A♠ A♥ A♦ A♣ 7♠'],
  ['葫芦', '三条加一对', 'K♠ K♥ K♦ 8♣ 8♠'],
  ['同花', '五张同花色，不必连续', 'A♥ J♥ 8♥ 5♥ 2♥'],
  ['顺子', '五张连续点数，花色不限', '9♠ 8♥ 7♦ 6♣ 5♠'],
  ['三条', '三张点数相同的牌', 'Q♠ Q♥ Q♦ 8♣ 3♠'],
  ['两对', '两组对子', 'J♠ J♥ 5♦ 5♣ A♠'],
  ['一对', '两张点数相同的牌', '10♠ 10♥ A♦ 8♣ 3♠'],
  ['高牌', '没有以上组合，比最高点数', 'A♠ J♥ 8♦ 6♣ 3♠'],
] as const;

function BeginnerGuide({ bigBlind }: { bigBlind: number }) {
  return (
    <div className="poker-guide">
      <p className="poker-guide-intro">
        只用虚拟筹码，没有行动倒计时。打开指南时对局暂停，关闭后回到原来的进度。
      </p>
      <section aria-labelledby="poker-guide-goal">
        <h3 id="poker-guide-goal">一手牌，要做什么？</h3>
        <p>
          用你的 2 张底牌和桌面最多 5 张公共牌，选出最强的 5 张。可以用 0、1 或
          2 张底牌。让所有对手弃牌，或在最后摊牌时胜出，就能赢得相应底池。
        </p>
        <ol className="poker-guide-flow">
          <li>
            <b>翻牌前</b>
            <span>先下大小盲，发 2 张底牌，轮流行动。</span>
          </li>
          <li>
            <b>翻牌</b>
            <span>亮出 3 张公共牌，再行动。</span>
          </li>
          <li>
            <b>转牌 / 河牌</b>
            <span>各亮出 1 张公共牌，每轮都能重新选择。</span>
          </li>
          <li>
            <b>摊牌</b>
            <span>
              仍在手中的玩家比较最强 5 张牌；完全相同则平分可赢的底池。
            </span>
          </li>
        </ol>
      </section>
      <section aria-labelledby="poker-guide-actions">
        <h3 id="poker-guide-actions">轮到你时，看这几个按钮</h3>
        <dl className="poker-guide-actions">
          <div>
            <dt>弃牌</dt>
            <dd>放弃这手牌，不再争夺底池。</dd>
          </div>
          <div>
            <dt>过牌</dt>
            <dd>没有需要补的下注时，免费把行动交给下一位。</dd>
          </div>
          <div>
            <dt>跟注</dt>
            <dd>
              补齐当前差额；按钮上的数字是这次新增的筹码。筹码不足时只跟入剩余筹码。
            </dd>
          </div>
          <div>
            <dt>下注 / 加注到</dt>
            <dd>
              设定本轮累计投入的总额。例如本轮已投 10，加注到 30，这次再投 20。
            </dd>
          </div>
        </dl>
        <p className="poker-guide-unit">
          <b>BB = 大盲。</b>当前 1 BB = {bigBlind} 筹码，2.5 BB ={' '}
          {bigBlind * 2.5} 筹码。大小盲是发牌前的强制下注，位置逐手轮换。
        </p>
      </section>
      <section aria-labelledby="poker-hand-ranks">
        <h3 id="poker-hand-ranks">
          牌型速查 <small>从强到弱</small>
        </h3>
        <ol className="poker-hand-ranks">
          {HAND_GUIDE.map(([name, description, example]) => (
            <li key={name}>
              <div>
                <b>{name}</b>
                <span>{description}</span>
              </div>
              <span className="poker-hand-example">{example}</span>
            </li>
          ))}
        </ol>
        <p>
          皇家同花顺是 A、K、Q、J、10 的同花顺。A 也能作最小牌组成 A、2、3、4、5
          顺子。花色不分大小；同牌型先比组成牌型的点数，再比其余牌（踢脚）。
        </p>
      </section>
      <p className="poker-guide-note">
        可以先用“入门”难度熟悉操作。每手结束后的复盘是本地近似模型，用来理解选择，不是获胜保证。
      </p>
    </div>
  );
}

export function HoldemLab({ fromExplore = false }: { fromExplore?: boolean }) {
  const [state, setState] = useState<HoldemState | null>(null);
  const [config, setConfig] = useState<TableConfig>({
    ...DEFAULT_TABLE_CONFIG,
  });
  const [handConfig, setHandConfig] = useState<TableConfig>({
    ...DEFAULT_TABLE_CONFIG,
  });
  const [draft, setDraft] = useState<ConfigDraft>(
    configDraft(DEFAULT_TABLE_CONFIG),
  );
  const [drawer, setDrawer] = useState<'settings' | 'review' | 'guide' | null>(
    null,
  );
  const [voice, setVoice] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('读取系统语音…');
  const [fullscreen, setFullscreen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const drawerRef = useRef<HTMLDialogElement | null>(null);
  const drawerPause = useRef(false);
  const spoken = useRef('');
  const [difficulty, setDifficulty] = useState<AiDifficulty>('standard');
  const [handDifficulty, setHandDifficulty] =
    useState<AiDifficulty>('standard');
  const [paused, setPaused] = useState(false);
  const [sound, setSound] = useState(false);
  const [music, setMusic] = useState(false);
  const [musicVolume, setMusicVolume] = useState(0.22);
  const [raiseChoice, setRaiseChoice] = useState<{
    turn: HoldemState;
    to: number;
  } | null>(null);
  const [practice, setPractice] = useState<Practice>(EMPTY_PRACTICE);
  const [review, setReview] = useState<ReviewPoint[] | null>(null);
  const [reviewError, setReviewError] = useState('');
  const [botError, setBotError] = useState<{
    turn: HoldemState;
    message: string;
  } | null>(null);
  const [botAttempt, setBotAttempt] = useState(0);
  const [reviewAttempt, setReviewAttempt] = useState(0);
  const [archive, setArchive] = useState<StoredHand | null>(null);
  const [reviewView, setReviewView] = useState<'hero' | 'table'>('hero');
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const soundRef = useRef<AudioContext | null>(null);
  const musicRef = useRef<HoldemLoungeMusic | null>(null);
  const counted = useRef<HoldemState | null>(null);
  const reviewed = useRef<HoldemState | null>(null);
  const mounted = useRef(true);
  const { getStrategy, fallback } = usePokerWorker();
  const currentBotError = botError?.turn === state ? botError.message : null;
  const completed = state?.street === 'complete';
  const humanTurn = state?.toAct === 0 && !paused;
  const legal = state ? legalActions(state) : null;
  const handNumber = state?.hand;
  const scrolledHand = useRef<number | null>(null);
  useEffect(() => {
    // On phones the control deck sticks to the bottom of the viewport. When
    // your first decision of a hand arrives (and the betting deck has grown),
    // scroll to the page end so your seat sits above the deck, not beneath it.
    if (!humanTurn || handNumber === undefined) return;
    if (scrolledHand.current === handNumber) return;
    scrolledHand.current = handNumber;
    if (!window.matchMedia('(max-width: 700px)').matches) return;
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    });
  }, [humanTurn, handNumber]);
  const raiseTo = legal
    ? raiseChoice?.turn === state
      ? Math.min(
          legal.maxTo,
          Math.max(Math.min(legal.minTo, legal.maxTo), raiseChoice.to),
        )
      : Math.min(legal.maxTo, legal.minTo)
    : 25;
  const setRaiseTo = (to: number) => {
    if (state) setRaiseChoice({ turn: state, to });
  };

  useEffect(() => {
    mounted.current = true;
    // oxlint-disable-next-line react/react-compiler -- Browser storage hydrates after shared initial render.
    setPractice(readPractice());
    try {
      const settings = JSON.parse(
        localStorage.getItem(SETTINGS_KEY) || '{}',
      ) as { difficulty?: AiDifficulty; volume?: number; config?: TableConfig };
      if (
        typeof settings.difficulty === 'string' &&
        Object.hasOwn(AI_DIFFICULTIES, settings.difficulty)
      )
        setDifficulty(settings.difficulty);
      if (settings.config && validateTableConfig(settings.config) === null) {
        setConfig(settings.config);
        setDraft(configDraft(settings.config));
      }
      if (Number.isFinite(settings.volume))
        setMusicVolume(Math.min(0.6, Math.max(0, settings.volume!)));
    } catch {
      /* Settings are optional. */
    }
    setReady(true);
    const hide = () => {
      if (document.hidden) {
        setPaused(true);
        musicRef.current?.pause();
        stopPokerVoice();
        void soundRef.current?.suspend();
      }
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      mounted.current = false;
      stopPokerVoice();
      document.removeEventListener('visibilitychange', hide);
      musicRef.current?.close();
      musicRef.current = null;
      void soundRef.current?.close();
      soundRef.current = null;
    };
  }, []);

  useEffect(() => {
    musicRef.current?.setVolume(musicVolume);
    if (music && !paused && !document.hidden)
      void musicRef.current?.play().catch(() => {
        if (mounted.current) setNotice('音乐暂时无法播放，可以继续练习。');
      });
    else musicRef.current?.pause();
  }, [music, musicVolume, paused]);

  const toggleMusic = () => {
    if (music) {
      musicRef.current?.pause();
      setMusic(false);
      return;
    }
    try {
      if (!musicRef.current) musicRef.current = new HoldemLoungeMusic();
      musicRef.current.setVolume(musicVolume);
      setMusic(true);
      // Resume directly from this explicit click to satisfy mobile autoplay policy.
      if (!paused && !document.hidden)
        void musicRef.current.play().catch(() => {
          setMusic(false);
          setNotice('浏览器暂时无法播放音乐。');
        });
      else
        void musicRef.current.unlock().catch(() => {
          if (mounted.current) setNotice('音乐暂时无法开启，可稍后再试。');
        });
    } catch {
      setNotice('浏览器不支持当前音乐播放。');
    }
  };

  const tone = useCallback(
    (win = false) => {
      if (!sound || document.hidden) return;
      try {
        const context =
          soundRef.current || (soundRef.current = new AudioContext());
        void context.resume();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(
          win ? 640 : 330,
          context.currentTime,
        );
        gain.gain.setValueAtTime(0.04, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          context.currentTime + 0.13,
        );
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.14);
      } catch {
        /* Sound is optional. */
      }
    },
    [sound],
  );

  useEffect(() => {
    if (!state || state.toAct === null || state.toAct === 0 || paused) return;
    const seat = state.toAct;
    // oxlint-disable-next-line react/react-compiler -- Clear feedback when this snapshot is explicitly retried or resumed.
    setBotError(null);
    const controller = new AbortController();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void getStrategy<{ action: PokerAction; trace: BotDecisionTrace }>(
      {
        type: 'bot',
        state,
        seat,
        style: STYLES[seat],
        difficulty: handDifficulty,
        styles: STYLES,
      },
      controller.signal,
    )
      .then(({ action, trace }) => {
        if (cancelled) return;
        setBotError(null);
        const voiceDeadline = Date.now() + 6000;
        const advance = () => {
          if (cancelled) return;
          // Let the previous public action finish speaking before another AI
          // action replaces it. A deadline also handles missing native onend.
          if (voice && pokerVoiceBusy() && Date.now() < voiceDeadline) {
            timer = setTimeout(advance, 120);
            return;
          }
          setState((current) =>
            current === state ? act(current, action, trace) : current,
          );
        };
        timer = setTimeout(advance, voice ? 1150 : 620);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setBotError({
            turn: state,
            message:
              error instanceof Error
                ? error.message
                : 'AI 计算暂时不可用，请重试。',
          });
      });
    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [state, paused, handDifficulty, getStrategy, voice, botAttempt]);

  useEffect(() => {
    if (!state?.result) return;
    if (counted.current !== state) {
      counted.current = state;
      const delta = state.stacks[0] - state.startingStacks[0];
      // oxlint-disable-next-line react/react-compiler -- Archive each completed engine snapshot exactly once.
      setPractice((p) => ({
        ...p,
        hands: p.hands + 1,
        wins: p.wins + Number(delta > 0),
        net: p.net + delta,
      }));
      tone(delta > 0);
    }
    let cancelled = false;
    const controller = new AbortController();
    void getStrategy<ReviewPoint[]>(
      {
        type: 'review',
        state,
        difficulty: handDifficulty,
        styles: STYLES,
      },
      controller.signal,
    )
      .then((points) => {
        if (cancelled) return;
        setReview(points);
        setReviewError('');
        if (reviewed.current !== state) {
          reviewed.current = state;
          const hand: StoredHand = {
            hand: state.hand,
            delta: state.stacks[0] - state.startingStacks[0],
            hero: state.holes[0],
            board: state.board,
            points,
            difficulty: handDifficulty,
            config: handConfig,
            reviewVersion: 2,
            tableReplay: safeTableReplay(state),
          };
          setPractice((p) => ({
            ...p,
            recent: [hand, ...p.recent].slice(0, 8),
          }));
        }
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setReviewError(
            error instanceof Error
              ? error.message
              : '复盘暂时不可用，完整行动线仍可查看。',
          );
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [state, getStrategy, reviewAttempt, tone, handDifficulty, handConfig]);

  useEffect(() => {
    if (!ready) return;
    try {
      const bounded = boundedPractice(practice);
      localStorage.setItem(STORAGE_KEY, bounded.serialized);
      if (bounded.trimmed) {
        // oxlint-disable-next-line react/react-compiler -- Match the displayed archive to the byte-bounded records actually persisted.
        setPractice((current) =>
          current === practice ? bounded.value : current,
        );
      }
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ difficulty, volume: musicVolume, config }),
      );
    } catch {
      // oxlint-disable-next-line react/react-compiler -- Reflect browser storage failure.
      setStorageAvailable(false);
    }
  }, [practice, difficulty, musicVolume, config, ready]);

  const play = useCallback(
    (action: PokerAction) => {
      if (!state || state.toAct !== 0 || paused) return;
      try {
        setState(act(state, action));
        setNotice('');
        tone();
      } catch (error) {
        setNotice(
          error instanceof Error ? error.message : '这个行动暂时不可用',
        );
      }
    },
    [state, paused, tone],
  );

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        !humanTurn ||
        !legal ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.repeat
      )
        return;
      if (
        event.target instanceof HTMLElement &&
        (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A'].includes(
          event.target.tagName,
        ) ||
          event.target.isContentEditable)
      )
        return;
      if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        play({ type: 'fold' });
      }
      if (event.key.toLowerCase() === 'c') {
        event.preventDefault();
        play({ type: legal.canCheck ? 'check' : 'call' });
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [humanTurn, legal, play]);

  function deal() {
    const error = validateTableConfig(config);
    if (error) {
      setNotice(error);
      return;
    }
    const resetStacks = !state || !sameTableConfig(handConfig, config);
    const stacks = tableSeats(config.tableSize).map((seat) =>
      resetStacks ||
      !state?.stacks[seat] ||
      state.stacks[seat] < config.bigBlind
        ? config.initialStack
        : state.stacks[seat],
    );
    try {
      setState(
        startHand({
          ...config,
          hand: state ? state.hand + 1 : 1,
          button: state ? nextButton(state) % config.tableSize : 0,
          stacks,
        }),
      );
      setHandConfig({ ...config });
      setHandDifficulty(difficulty);
      setPaused(false);
      setReview(null);
      setReviewError('');
      setArchive(null);
      setNotice('');
      setBotError(null);
      tone();
    } catch (failure) {
      setNotice(
        failure instanceof Error ? failure.message : '牌桌配置暂时不可用',
      );
    }
  }
  function setSize(fraction: number) {
    if (!legal || !state) return;
    setRaiseTo(
      Math.min(
        legal.maxTo,
        Math.max(
          legal.minTo,
          Math.max(...state.streetBets) +
            Math.round((legal.pot + legal.call) * fraction),
        ),
      ),
    );
  }
  const latest = state?.actions.at(-1);
  const shownReview = archive?.points || review;
  const scoreable = shownReview?.filter(
    (point) => !point.scoreSensitive && point.comparison !== 'sensitive',
  );
  const average = scoreable?.length
    ? (
        scoreable.reduce((sum, point) => sum + point.score, 0) /
        scoreable.length
      ).toFixed(1)
    : null;
  const currentScoreable = review?.filter(
    (point) => !point.scoreSensitive && point.comparison !== 'sensitive',
  );
  const currentAverage = currentScoreable?.length
    ? (
        currentScoreable.reduce((sum, point) => sum + point.score, 0) /
        currentScoreable.length
      ).toFixed(1)
    : null;
  const shownReplay = useMemo(
    () =>
      archive
        ? archive.tableReplay
        : completed && state
          ? safeTableReplay(state)
          : undefined,
    [archive, completed, state],
  );
  const legacyReview = Boolean(archive && archive.reviewVersion !== 2);
  const delta = state ? state.stacks[0] - state.startingStacks[0] : 0;
  const currentConfig = state ? handConfig : config;
  const seats = tableSeats(currentConfig.tableSize);
  const draftConfig = numericConfig(draft);
  const configError = validateTableConfig(draftConfig);
  const pendingConfig =
    state &&
    (!sameTableConfig(config, handConfig) || difficulty !== handDifficulty);

  useEffect(() => {
    const refreshVoice = () => {
      const availability = pokerVoiceAvailability();
      setVoiceStatus(
        !availability.supported
          ? '此浏览器不支持语音播报。'
          : !availability.ready
            ? availability.hasVoices
              ? '系统没有中文声线，行动语音暂不可用。'
              : '系统尚未加载中文声线，行动语音暂不可用。'
            : '中文行动播报已就绪。',
      );
      setVoiceAvailable(availability.ready);
      if (!availability.ready) setVoice(false);
    };
    refreshVoice();
    const synthesis =
      'speechSynthesis' in window ? window.speechSynthesis : null;
    synthesis?.addEventListener('voiceschanged', refreshVoice);
    const timer = setTimeout(refreshVoice, 1500);
    const fullscreenChanged = () =>
      setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', fullscreenChanged);
    return () => {
      clearTimeout(timer);
      synthesis?.removeEventListener('voiceschanged', refreshVoice);
      document.removeEventListener('fullscreenchange', fullscreenChanged);
      stopPokerVoice();
    };
  }, []);

  useEffect(() => {
    if (paused || !voice) stopPokerVoice();
  }, [paused, voice]);

  useEffect(() => {
    if (!state || !latest) return;
    const key = `${state.hand}:${state.actions.length}:${completed ? 'result' : 'action'}`;
    if (spoken.current === key) return;
    spoken.current = key;
    if (!voice || paused || document.hidden) return;
    const words =
      completed && state.result
        ? `${state.result.winners.map((seat) => SEAT_NAMES[seat]).join('和')}赢得底池。`
        : `${SEAT_NAMES[latest.seat]}，${actionLabel(latest)}。`;
    announcePoker(words);
  }, [state, latest, completed, voice, paused]);

  useEffect(() => {
    const dialog = drawerRef.current;
    if (drawer && dialog && !dialog.open) dialog.showModal();
    if (!drawer && dialog?.open) dialog.close();
  }, [drawer]);

  function openDrawer(which: 'settings' | 'review' | 'guide') {
    if (!drawer) drawerPause.current = paused;
    if (which === 'settings') setDraft(configDraft(config));
    setPaused(true);
    setDrawer(which);
  }
  function closeDrawer() {
    setDrawer(null);
    if (!drawerPause.current && !document.hidden) setPaused(false);
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (rootRef.current?.requestFullscreen)
        await rootRef.current.requestFullscreen();
      else setNotice('当前浏览器未提供全屏按钮，牌桌已适配屏幕宽度。');
    } catch {
      setNotice('浏览器暂时无法切换全屏，仍可继续练习。');
    }
  }
  function applyConfig() {
    if (configError) return;
    setConfig(draftConfig);
    setDraft(configDraft(draftConfig));
    closeDrawer();
  }

  return (
    <div className="holdem-lab poker-immersive" ref={rootRef}>
      <header className="poker-topbar">
        <a className="poker-back" href={fromExplore ? '/explore' : '/games'}>
          <ArrowLeft size={16} />
          <span>{fromExplore ? '返回机甲' : '游戏室'}</span>
        </a>
        <div className="poker-table-title">
          <strong>德州扑克</strong>
          <span>
            {currentConfig.tableSize} 人桌 · {currentConfig.smallBlind}/
            {currentConfig.bigBlind} ·{' '}
            {AI_DIFFICULTIES[state ? handDifficulty : difficulty].label}
          </span>
        </div>
        <div className="poker-utilities">
          {(state || music) && (
            <button
              type="button"
              onClick={() => setPaused((value) => !value)}
              aria-pressed={paused}
              aria-label={paused ? '继续练习' : '暂停练习'}
            >
              {paused ? <Play size={16} /> : <Pause size={16} />}
              <span>{paused ? '继续' : '暂停'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={toggleMusic}
            aria-pressed={music}
            aria-label={music ? '关闭背景音乐' : '打开背景音乐'}
          >
            <Music2 size={16} />
            <span>音乐</span>
          </button>
          <button
            type="button"
            onClick={() => setSound((value) => !value)}
            aria-pressed={sound}
            aria-label={sound ? '关闭游戏音效' : '打开游戏音效'}
          >
            {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button
            type="button"
            onClick={() => {
              const available = pokerVoiceAvailability();
              if (!available.ready) setNotice(voiceStatus);
              setVoice((value) => !value);
            }}
            aria-pressed={voice}
            disabled={!voiceAvailable}
            title={!voiceAvailable ? voiceStatus : undefined}
            aria-label={voice ? '关闭行动语音' : '打开行动语音'}
          >
            <MessageCircle size={16} />
            <span>语音</span>
          </button>
          <button
            type="button"
            className="poker-fullscreen-button"
            onClick={() => void toggleFullscreen()}
            aria-label={fullscreen ? '退出全屏' : '进入全屏'}
          >
            {fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
          <button
            type="button"
            onClick={() => openDrawer('settings')}
            aria-label="牌桌设置"
          >
            <Settings2 size={18} />
            <span>设置</span>
          </button>
        </div>
      </header>
      <main className="poker-main">
        <section
          className={`poker-arena seat-count-${currentConfig.tableSize} ${paused ? 'is-paused' : ''}`}
          aria-label={`${currentConfig.tableSize} 人德州扑克练习桌`}
        >
          <div className="poker-room-light" aria-hidden="true" />
          <div className="poker-table">
            <div className="poker-felt-emblem" aria-hidden="true">
              <Spade size={80} strokeWidth={0.65} />
            </div>
          </div>
          {seats.map((seat) => (
            <TableSeat
              seat={seat}
              key={seat}
              state={state}
              paused={paused}
              config={currentConfig}
              calculationError={Boolean(currentBotError)}
            />
          ))}
          <div className={`poker-center ${state ? '' : 'is-ready'}`}>
            <div className="poker-pot">
              <span>
                {state ? STREET_LABELS[state.street] : 'NO LIMIT HOLD’EM'}
              </span>
              <strong>
                {state
                  ? (state.result?.pot ?? potSize(state)).toLocaleString()
                  : '坐下来，打一手。'}
              </strong>
              <small>
                {state ? '底池筹码' : '位置、范围，以及你的每个选择'}
              </small>
            </div>
            <div className="poker-board" aria-label="公共牌">
              {Array.from({ length: 5 }, (_, i) =>
                state?.board[i] !== undefined ? (
                  <PlayingCard
                    key={`${state.hand}-${state.board[i]}`}
                    card={state.board[i]}
                  />
                ) : (
                  <span
                    key={i}
                    className="poker-card-slot"
                    aria-label={`第 ${i + 1} 张公共牌尚未发出`}
                  />
                ),
              )}
            </div>
            <output className="poker-table-status" aria-live="polite">
              {!state
                ? '只用虚拟筹码，没有倒计时。'
                : paused
                  ? '练习已暂停'
                  : completed
                    ? `${state.result?.winners.map((seat) => SEAT_NAMES[seat]).join('、')} ${state.result?.winners.length === 1 ? '赢下底池' : '分享底池'}`
                    : state.toAct === 0
                      ? '轮到你行动'
                      : currentBotError
                        ? 'AI 计算未完成，请重试'
                        : `${state.toAct === null ? '其他席位' : SEAT_NAMES[state.toAct]}正在思考…`}
            </output>
            {state && !completed && (
              <small className="poker-live-count">
                {state.folded.filter((folded) => !folded).length} 位仍在底池 ·
                第 {state.hand} 手
              </small>
            )}
            {completed && state?.result && state.result.pots.length > 1 && (
              <small className="poker-live-count">
                {state.result.pots.length} 个底池分别结算 · 复盘查看分配
              </small>
            )}
          </div>
          {latest && latest.paid > 0 && (
            <span
              key={`${state?.hand}-${state?.actions.length}`}
              className="poker-chip-flight"
              aria-hidden="true"
              style={
                {
                  '--origin-x': `${seatPosition(latest.seat, currentConfig.tableSize).x}%`,
                  '--origin-y': `${seatPosition(latest.seat, currentConfig.tableSize).y}%`,
                  '--mobile-origin-x': `${mobileSeatPosition(latest.seat, currentConfig.tableSize).x}%`,
                  '--mobile-origin-y': `${mobileSeatPosition(latest.seat, currentConfig.tableSize).y}%`,
                } as CSSProperties
              }
            >
              <i />
              <i />
              <i />
            </span>
          )}
          {state && (
            <div className="poker-action-ribbon" aria-label="最近行动">
              {state.actions.slice(-3).map((decision, i) => (
                <span key={`${state.actions.length - 3 + i}`}>
                  <b>{SEAT_NAMES[decision.seat]}</b> {actionLabel(decision)}
                </span>
              ))}
            </div>
          )}
          {pendingConfig && (
            <span className="poker-next-config">新设置将在下一手生效</span>
          )}
        </section>
        <section className="poker-control-deck" aria-label="下注与对局操作">
          {!state ? (
            <div className="poker-start">
              <div>
                <h1>先打一手，再拆开思路。</h1>
                <p>
                  {currentConfig.tableSize - 1} 位 AI 对手 · 初始{' '}
                  {config.initialStack / config.bigBlind} BB · 1 BB ={' '}
                  {config.bigBlind} 筹码 · 难度、人数和盲注均可设置
                </p>
              </div>
              <button
                type="button"
                className="poker-secondary"
                onClick={() => openDrawer('guide')}
                aria-haspopup="dialog"
              >
                <BookOpen size={16} />
                新手指南
              </button>
              <button
                type="button"
                className="poker-primary"
                onClick={deal}
                disabled={!ready}
              >
                开始练习 <ArrowRight size={17} />
              </button>
            </div>
          ) : completed ? (
            <div className="poker-finish">
              <div>
                <strong>
                  {delta >= 0 ? '+' : ''}
                  {delta.toLocaleString()}
                  <small> 虚拟筹码</small>
                </strong>
                <p>
                  {currentAverage === null
                    ? review
                      ? '本手没有可计入均分的选择。'
                      : reviewError
                        ? '复盘尚未完成，可重试或开始下一手。'
                        : '正在整理你的决策…'
                    : `本手平均模型评分 ${currentAverage} / 100`}
                </p>
              </div>
              <button
                type="button"
                className="poker-secondary"
                onClick={() => {
                  setArchive(null);
                  openDrawer('review');
                }}
              >
                <BookOpen size={16} />
                查看本手复盘
              </button>
              <button
                type="button"
                className="poker-primary"
                onClick={deal}
                disabled={!review && !reviewError}
              >
                {review || reviewError ? '下一手' : '整理复盘…'}{' '}
                <ArrowRight size={17} />
              </button>
            </div>
          ) : (
            <div className="poker-playing-controls">
              <div className="poker-turn-caption">
                <span>
                  {paused
                    ? '点击继续恢复对局'
                    : state.folded[0]
                      ? '你已弃牌，观察其他席位。'
                      : humanTurn
                        ? legal?.canCheck
                          ? '免费过牌，或主动下注。'
                          : `跟注 ${legal?.call} · 当前底池 ${legal?.pot}`
                        : `等待${state.toAct === null ? '其他席位' : SEAT_NAMES[state.toAct]}行动`}
                </span>
                <small>
                  {positionLabel(state, 0)} · {state.stacks[0]} 筹码
                </small>
              </div>
              <div className="poker-actions">
                <button
                  type="button"
                  onClick={() => play({ type: 'fold' })}
                  disabled={!humanTurn}
                >
                  弃牌 <kbd>F</kbd>
                </button>
                <button
                  type="button"
                  className="poker-call"
                  aria-describedby={humanTurn ? 'poker-call-help' : undefined}
                  onClick={() =>
                    play({ type: legal?.canCheck ? 'check' : 'call' })
                  }
                  disabled={!humanTurn}
                >
                  {legal?.canCheck
                    ? '过牌'
                    : `跟注 ${humanTurn ? (legal?.call ?? '') : ''}`}{' '}
                  <kbd>C</kbd>
                </button>
                <button
                  type="button"
                  className="poker-primary"
                  onClick={() => play({ type: 'raise', to: raiseTo })}
                  disabled={!humanTurn || !legal?.canRaise}
                >
                  {Math.max(...state.streetBets) === 0 ? '下注' : '加注到'}{' '}
                  {humanTurn && legal?.canRaise ? raiseTo : ''}
                </button>
              </div>
              {humanTurn && legal && (
                <p className="poker-bet-help" id="poker-call-help">
                  1 BB = {state.bigBlind} 筹码 ·{' '}
                  {legal.canCheck
                    ? '过牌不花筹码。'
                    : `跟注需再投入 ${legal.call} 筹码（${Number((legal.call / state.bigBlind).toFixed(2))} BB）。`}
                  {legal.canRaise && '“加注到”是本轮累计总额。'}
                </p>
              )}
              {humanTurn && legal?.canRaise && (
                <div className="poker-sizing">
                  <div className="poker-size-presets">
                    {state.street === 'preflop' &&
                    Math.max(...state.streetBets) === state.bigBlind ? (
                      <button
                        type="button"
                        onClick={() =>
                          setRaiseTo(
                            Math.min(
                              legal.maxTo,
                              Math.max(
                                legal.minTo,
                                Math.round(state.bigBlind * 2.5),
                              ),
                            ),
                          )
                        }
                      >
                        2.5 BB
                      </button>
                    ) : (
                      <>
                        <button type="button" onClick={() => setSize(0.33)}>
                          ⅓ 底池
                        </button>
                        <button type="button" onClick={() => setSize(0.5)}>
                          ½ 底池
                        </button>
                        <button type="button" onClick={() => setSize(1)}>
                          底池
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setRaiseTo(legal.maxTo)}
                    >
                      全下
                    </button>
                  </div>
                  <label>
                    <span>本轮总下注</span>
                    <input
                      type="range"
                      aria-label="调整本轮累计总下注额度"
                      min={Math.min(legal.minTo, legal.maxTo)}
                      max={legal.maxTo}
                      step={1}
                      value={raiseTo}
                      onChange={(event) =>
                        setRaiseTo(Number(event.target.value))
                      }
                    />
                    <output>{raiseTo}</output>
                  </label>
                </div>
              )}
            </div>
          )}
          {currentBotError && !completed && (
            <div className="poker-worker-error">
              <p role="alert">{currentBotError}</p>
              <button
                type="button"
                className="poker-secondary"
                disabled={paused}
                onClick={() => {
                  setBotError(null);
                  setBotAttempt((attempt) => attempt + 1);
                }}
              >
                <RotateCcw size={15} />
                重试 AI 行动
              </button>
              {paused && <small>继续练习后会重新计算。</small>}
            </div>
          )}
          {fallback && (
            <output className="poker-computation-note">
              计算线程不可用，已切换分段计算。模型不变，耗时可能稍长。
            </output>
          )}
          {notice && (
            <p className="poker-action-error" role="alert">
              {notice}
            </p>
          )}
        </section>
      </main>
      <footer className="poker-footer">
        <span>虚拟筹码 · 本地 AI</span>
        <button
          type="button"
          className="poker-guide-entry"
          onClick={() => openDrawer('guide')}
          aria-haspopup="dialog"
          aria-label="新手指南与牌型速查"
        >
          <BookOpen size={14} />
          新手 / 牌型速查
        </button>
        <button type="button" onClick={() => openDrawer('review')}>
          <BookOpen size={14} />
          练习记录 <b>{practice.hands}</b>
        </button>
      </footer>
      {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- Native modal backdrop clicks dismiss; Escape is handled by onCancel and the close button is keyboard accessible. */}
      <dialog
        className={`poker-drawer ${drawer === 'review' ? 'is-review' : ''}`}
        ref={drawerRef}
        onCancel={(event) => {
          event.preventDefault();
          closeDrawer();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDrawer();
        }}
        aria-labelledby="poker-drawer-title"
      >
        <div className="poker-drawer-inner">
          <header>
            <h2 id="poker-drawer-title">
              {drawer === 'settings'
                ? '把这张桌子调成你的节奏。'
                : drawer === 'guide'
                  ? '新手指南与牌型速查'
                  : '每个选择，都有来由。'}
            </h2>
            <button type="button" onClick={closeDrawer} aria-label="关闭面板">
              <X size={20} />
            </button>
          </header>
          {drawer === 'guide' ? (
            <BeginnerGuide bigBlind={currentConfig.bigBlind} />
          ) : drawer === 'settings' ? (
            <div className="poker-settings-content">
              <section>
                <h3>牌桌配置</h3>
                <p>
                  配置在下一手生效。人数、大小盲或初始筹码变更后，整桌按新初始筹码重开；相同配置延续余额，低于大盲的席位自动补至初始筹码。
                </p>
                <div className="poker-config-grid">
                  <label>
                    人数
                    <select
                      value={draft.tableSize}
                      onChange={(event) =>
                        setDraft((old) => ({
                          ...old,
                          tableSize: event.target.value,
                        }))
                      }
                    >
                      {Array.from({ length: 8 }, (_, i) => (
                        <option key={i} value={i + 2}>
                          {i + 2} 人
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    小盲
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={draft.smallBlind}
                      onChange={(event) =>
                        setDraft((old) => ({
                          ...old,
                          smallBlind: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    大盲
                    <input
                      type="number"
                      min="2"
                      step="1"
                      value={draft.bigBlind}
                      onChange={(event) =>
                        setDraft((old) => ({
                          ...old,
                          bigBlind: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    每席初始筹码
                    <input
                      type="number"
                      min="2"
                      step="1"
                      value={draft.initialStack}
                      onChange={(event) =>
                        setDraft((old) => ({
                          ...old,
                          initialStack: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
                <p
                  className={
                    configError ? 'poker-setting-error' : 'poker-setting-hint'
                  }
                  role={configError ? 'alert' : undefined}
                >
                  {configError ??
                    `起始深度 ${(draftConfig.initialStack / draftConfig.bigBlind).toFixed(1)} BB。低于大盲的席位下一手补充至初始筹码。`}
                </p>
              </section>
              <section>
                <h3>AI 难度</h3>
                <fieldset
                  className="poker-difficulty-options"
                  aria-label="选择下一手 AI 难度"
                >
                  {(Object.keys(AI_DIFFICULTIES) as AiDifficulty[]).map(
                    (level) => (
                      <button
                        type="button"
                        key={level}
                        aria-pressed={difficulty === level}
                        onClick={() => setDifficulty(level)}
                      >
                        {AI_DIFFICULTIES[level].label}
                      </button>
                    ),
                  )}
                </fieldset>
                <p>
                  {AI_DIFFICULTIES[difficulty].description}每个 AI
                  还有独立的均衡、稳健、积极或灵活性格。
                </p>
              </section>
              <section>
                <h3>桌边声音</h3>
                <div className="poker-sound-toggles">
                  <button
                    type="button"
                    aria-pressed={music}
                    onClick={toggleMusic}
                  >
                    <Music2 size={16} />
                    背景音乐 {music ? '开' : '关'}
                  </button>
                  <button
                    type="button"
                    aria-pressed={sound}
                    onClick={() => setSound((value) => !value)}
                  >
                    <Volume2 size={16} />
                    音效 {sound ? '开' : '关'}
                  </button>
                  <button
                    type="button"
                    aria-pressed={voice}
                    disabled={!voiceAvailable}
                    title={!voiceAvailable ? voiceStatus : undefined}
                    onClick={() => setVoice((value) => !value)}
                  >
                    <MessageCircle size={16} />
                    行动语音 {voice ? '开' : '关'}
                  </button>
                </div>
                <label className="poker-volume-control">
                  <span>音乐音量</span>
                  <input
                    type="range"
                    min="0"
                    max="60"
                    step="1"
                    value={Math.round(musicVolume * 100)}
                    onChange={(event) =>
                      setMusicVolume(Number(event.target.value) / 100)
                    }
                    aria-label="背景音乐音量"
                  />
                  <output>{Math.round(musicVolume * 100)}%</output>
                </label>
                <p>
                  原创电钢琴、低音与轻刷鼓。{voiceStatus}
                  暂停或切到后台时，音乐和语音随之停止。
                </p>
              </section>
              <details className="poker-rules">
                <summary>
                  规则与模型说明 <ChevronDown size={15} />
                </summary>
                <p>
                  两张手牌与公共牌组成最佳五张牌。单挑按钮位付小盲，翻牌前先行动；多人桌按按钮后的大小盲与顺序轮流行动。
                </p>
                <p>
                  滑块是本轮累计投入。不同全下金额建立主池、边池，分别结算；弃牌后仍会等待其他席位完成对局。
                </p>
                <p>
                  AI 只能使用自己的底牌和公开行动；复盘比较近似模型的候选
                  EV，不根据输赢打分，也不是严格 GTO 求解结果。
                </p>
                <a
                  href="https://www.pokertda.com/view-poker-tda-rules/"
                  target="_blank"
                  rel="noreferrer"
                >
                  规则参考 ↗
                </a>
              </details>
              <button
                type="button"
                className="poker-primary poker-apply-config"
                disabled={Boolean(configError)}
                onClick={applyConfig}
              >
                应用到下一手 <Check size={16} />
              </button>
            </div>
          ) : (
            <section className="poker-review">
              <header>
                <div>
                  <BookOpen size={19} />
                  <h3>
                    {reviewView === 'hero'
                      ? '逐个选择，拆开思路。'
                      : '揭开底牌，重看这一手。'}
                  </h3>
                </div>
                <p>
                  {reviewView === 'table' ? (
                    '真实行动线与行动前保存的 AI 诊断。'
                  ) : average !== null ? (
                    <>
                      <b>{average}</b> / 100 平均
                      {legacyReview ? '旧模型' : '模型'}评分
                    </>
                  ) : (
                    '只看当时已经知道的信息。'
                  )}
                </p>
              </header>
              {practice.recent.length > 0 && (
                <fieldset
                  className="poker-history"
                  aria-label="选择最近的练习记录"
                >
                  <button
                    type="button"
                    aria-pressed={!archive}
                    onClick={() => setArchive(null)}
                  >
                    当前对局
                  </button>
                  {practice.recent.map((hand, i) => (
                    <button
                      type="button"
                      key={`${hand.hand}-${i}`}
                      aria-pressed={archive === hand}
                      onClick={() => setArchive(hand)}
                    >
                      记录 {practice.hands - i}
                      <small>
                        {hand.delta >= 0 ? '+' : ''}
                        {hand.delta}
                      </small>
                    </button>
                  ))}
                </fieldset>
              )}
              <div className="poker-review-switch" aria-label="复盘视角">
                <button
                  type="button"
                  aria-pressed={reviewView === 'hero'}
                  onClick={() => setReviewView('hero')}
                >
                  <BookOpen size={16} />
                  我的选择
                </button>
                <button
                  type="button"
                  aria-pressed={reviewView === 'table'}
                  onClick={() => setReviewView('table')}
                >
                  <Spade size={16} />
                  全桌回放
                </button>
              </div>
              {legacyReview && (
                <p className="poker-legacy-review">
                  这是保留的旧模型记录，分数未用新版规则重新校准；它仍可作为当时的练习笔记。
                </p>
              )}
              {reviewView === 'table' ? (
                shownReplay ? (
                  <TableReplayView
                    key={
                      archive
                        ? `archive-${archive.hand}-${practice.recent.indexOf(archive)}`
                        : `live-${state?.hand}`
                    }
                    replay={shownReplay}
                    heroPoints={shownReview}
                    legacy={legacyReview}
                  />
                ) : (
                  <div className="poker-empty-review poker-replay-unavailable">
                    <Spade size={24} />
                    <strong>
                      {archive
                        ? '旧记录未保存全桌回放'
                        : completed
                          ? '本手没有可用的全桌回放'
                          : '结束一手后，打开全桌回放'}
                    </strong>
                    <p>
                      {archive
                        ? '保留你的原始决策复盘，不事后猜测对手底牌、随机选择或策略理由。'
                        : completed
                          ? '你的个人复盘仍可查看。无法验证的回放数据不会展示。'
                          : '进行中仍保持对手底牌隐藏；结束后可查看已弃牌的手牌和每一轮行动。'}
                    </p>
                  </div>
                )
              ) : (
                <>
                  {archive && (
                    <div className="poker-review-cards">
                      <span>
                        {archive.config?.tableSize ?? 5} 人 ·{' '}
                        {AI_DIFFICULTIES[archive.difficulty].label}
                      </span>
                      {archive.hero.map((card) => (
                        <PlayingCard card={card} key={card} small />
                      ))}
                      <span>结束公共牌</span>
                      {archive.board.map((card) => (
                        <PlayingCard card={card} key={card} small />
                      ))}
                    </div>
                  )}
                  {shownReview ? (
                    shownReview.length > 0 ? (
                      <div className="poker-review-list">
                        {shownReview.map((point, i) => (
                          <ReviewCard
                            key={`${archive?.hand || state?.hand}-${point.index}`}
                            point={point}
                            first={i === 0}
                            legacy={legacyReview}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="poker-empty-review">
                        <Check size={20} />
                        本手在你行动前已经结束。
                      </p>
                    )
                  ) : completed ? (
                    reviewError ? (
                      <div className="poker-empty-review">
                        <p role="alert">{reviewError}</p>
                        <button
                          type="button"
                          onClick={() => {
                            setReviewError('');
                            setReviewAttempt((n) => n + 1);
                          }}
                        >
                          <RotateCcw size={15} />
                          重试
                        </button>
                      </div>
                    ) : (
                      <p className="poker-empty-review">
                        <LoaderCircle className="poker-spinner" size={20} />
                        正在整理范围、候选行动与评分…
                      </p>
                    )
                  ) : (
                    <p className="poker-empty-review">
                      <Spade size={22} />
                      完成一手后，这里展开你的每个选择。
                    </p>
                  )}
                  {state?.result &&
                    !archive &&
                    (state.result.pots.length > 1 ||
                      state.result.returned.some((chips) => chips > 0)) && (
                      <details className="poker-pot-breakdown">
                        <summary>
                          主池、边池与退款 <ChevronDown size={14} />
                        </summary>
                        {state.result.pots.map((pot, i) => (
                          <p key={i}>
                            {i === 0 ? '主池' : `边池 ${i}`} {pot.amount} →{' '}
                            {pot.winners
                              .map((seat) => SEAT_NAMES[seat])
                              .join('、')}
                          </p>
                        ))}
                        {seats
                          .filter((seat) => state.result!.returned[seat] > 0)
                          .map((seat) => (
                            <p key={seat}>
                              {SEAT_NAMES[seat]}未被跟注的{' '}
                              {state.result!.returned[seat]} 已退回。
                            </p>
                          ))}
                      </details>
                    )}
                  {state?.actions.length && !archive ? (
                    <details className="poker-hand-timeline">
                      <summary>
                        当前手完整行动线 <ChevronDown size={15} />
                      </summary>
                      <ol>
                        {state.actions.map((decision, i) => (
                          <li
                            key={i}
                            className={decision.seat === 0 ? 'is-human' : ''}
                          >
                            <small>{STREET_LABELS[decision.street]}</small>
                            <span>{SEAT_NAMES[decision.seat]}</span>
                            <strong>{actionLabel(decision)}</strong>
                            <span>底池 {decision.pot}</span>
                          </li>
                        ))}
                      </ol>
                    </details>
                  ) : null}
                  <p className="poker-review-limit">
                    {legacyReview
                      ? '旧分数沿用当时的近似模型，不作新版准确性承诺。'
                      : '新版数分把相对常规数值参照的原始 EV 损失映射到 0–100；显示 100 只表示在当前精度内接近这组有限候选的参照。'}
                    不是获胜概率、专业 GTO
                    百分比或全局最优证明。无法稳定估值的大尺度暂不评分，也不计入均分。
                  </p>
                </>
              )}
              <div className="poker-practice-record">
                <strong>{practice.hands} 手</strong>
                <span>盈利 {practice.wins} 手</span>
                <span>
                  累计 {practice.net >= 0 ? '+' : ''}
                  {practice.net}
                </span>
                <small>
                  {storageAvailable
                    ? '本机最多保留最近 8 手；达到存储上限时先移除最旧记录，累计统计保留。'
                    : '存储不可用，当前页面内保留。'}
                </small>
              </div>
            </section>
          )}
        </div>
      </dialog>
    </div>
  );
}
