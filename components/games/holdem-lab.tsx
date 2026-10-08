'use client';
import {
  useCallback,
  useEffect,
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
  decideBot,
  nextButton,
  pct,
  positionLabel,
  reviewHand,
  type AiDifficulty,
  type BotStyle,
  type ReviewPoint,
} from '@/lib/games/holdem-strategy';
import { HoldemLoungeMusic } from '@/lib/games/holdem-music';
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
  const worker = useRef<Worker | null>(null);
  const serial = useRef(0);
  const generation = useRef(0);
  const disposed = useRef(false);
  const fallbacks = useRef(
    new Map<ReturnType<typeof setTimeout>, (error: Error) => void>(),
  );
  const pending = useRef(
    new Map<
      number,
      { resolve: (result: unknown) => void; reject: (error: Error) => void }
    >(),
  );
  useEffect(() => {
    disposed.current = false;
    generation.current++;
    const effectGeneration = generation.current;
    let instance: Worker | null = null;
    try {
      instance = new Worker(new URL('./holdem-worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.current = instance;
      instance.onmessage = (
        event: MessageEvent<{ id: number; result?: unknown; error?: string }>,
      ) => {
        if (
          generation.current !== effectGeneration ||
          worker.current !== instance
        )
          return;
        const task = pending.current.get(event.data.id);
        if (!task) return;
        pending.current.delete(event.data.id);
        if (event.data.error) task.reject(new Error(event.data.error));
        else task.resolve(event.data.result);
      };
      instance.onerror = () => {
        if (
          generation.current !== effectGeneration ||
          worker.current !== instance
        )
          return;
        for (const task of pending.current.values())
          task.reject(new Error('计算线程不可用'));
        pending.current.clear();
        instance?.terminate();
        worker.current = null;
      };
    } catch {
      worker.current = null;
    }
    const tasks = pending.current;
    const timers = fallbacks.current;
    return () => {
      disposed.current = true;
      // oxlint-disable-next-line react-hooks/exhaustive-deps -- This imperative lifecycle counter invalidates async work; it is not a DOM ref.
      generation.current++;
      instance?.terminate();
      worker.current = null;
      for (const task of tasks.values()) task.reject(new Error('页面已离开'));
      tasks.clear();
      for (const [timer, reject] of timers) {
        clearTimeout(timer);
        reject(new Error('页面已离开'));
      }
      timers.clear();
    };
  }, []);
  return useCallback(<T,>(job: Job): Promise<T> => {
    const jobGeneration = generation.current;
    if (disposed.current) return Promise.reject(new Error('页面已离开'));
    return new Promise<T>((resolve, reject) => {
      if (!worker.current) {
        reject(new Error('计算线程不可用'));
        return;
      }
      const id = ++serial.current;
      pending.current.set(id, {
        resolve: (result) => resolve(result as T),
        reject,
      });
      try {
        worker.current.postMessage({ ...job, id });
      } catch (error) {
        pending.current.delete(id);
        reject(error instanceof Error ? error : new Error('计算请求失败'));
      }
    }).catch((error: unknown) => {
      if (disposed.current || generation.current !== jobGeneration) throw error;
      return new Promise<T>((resolve, reject) => {
        // Defer fallback to let the loading status paint in browsers without module workers.
        const timer = setTimeout(() => {
          // oxlint-disable-next-line react/react-compiler -- Stable ref registry tracks cancellable computation timers, independent of render data.
          fallbacks.current.delete(timer);
          if (disposed.current || generation.current !== jobGeneration) {
            reject(new Error('页面已离开'));
            return;
          }
          try {
            resolve(
              (job.type === 'bot'
                ? decideBot(
                    job.state,
                    job.seat,
                    job.style,
                    job.difficulty,
                    job.styles,
                  )
                : reviewHand(
                    job.state,
                    REVIEW_SAMPLES[job.difficulty],
                    undefined,
                    job.styles,
                  )) as T,
            );
          } catch (failure) {
            reject(
              failure instanceof Error ? failure : new Error('策略计算失败'),
            );
          }
        }, 0);
        fallbacks.current.set(timer, reject);
      });
    });
  }, []);
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
function readPractice(): Practice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw || raw.length > 700000) return EMPTY_PRACTICE;
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
        ),
    };
  } catch {
    return EMPTY_PRACTICE;
  }
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
}: {
  seat: Seat;
  state: HoldemState | null;
  paused: boolean;
  config: TableConfig;
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

function ReviewCard({ point, first }: { point: ReviewPoint; first: boolean }) {
  const grade =
    point.score >= 85 ? 'good' : point.score >= 60 ? 'mixed' : 'costly';
  const selected = point.alternatives.find((a) => a.label === point.action);
  return (
    <details className={`poker-review-point grade-${grade}`} open={first}>
      <summary>
        <span className="poker-review-score">
          <b>{Math.round(point.score)}</b>
          <small>{point.scoreSensitive ? '尺度敏感' : '模型评分'}</small>
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
          <span>模型推荐</span>
          <strong>{point.recommendation.label}</strong>
          <small>
            你的选择与最高估值相差 {point.regretBB.toFixed(1)} BB · 模型置信度
            {point.confidence === 'medium' ? '中' : '低'}
          </small>
        </div>
        {point.scoreSensitive && (
          <p className="poker-score-sensitive">
            这个尺度远超当前可争夺底池，估值对对手继续范围非常敏感。
            高分仅表示本模型无法可靠区分，建议先参考较稳定的常规尺度。
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
                  className={
                    option === selected
                      ? 'is-selected'
                      : option.label === point.recommendation.label
                        ? 'is-recommended'
                        : ''
                  }
                >
                  <th scope="row">
                    {option.label}
                    {option.label === point.action && <small>你的选择</small>}
                    {option.label === point.recommendation.label && (
                      <small>模型推荐</small>
                    )}
                  </th>
                  <td>
                    {option.evBB >= 0 ? '+' : ''}
                    {option.evBB.toFixed(1)}
                    <small>±{option.standardErrorBB.toFixed(1)}</small>
                  </td>
                  <td>
                    {Math.round(option.score)}
                    {option.scoreSensitive && <small>尺度敏感</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
              评分与稳健推荐另留 {point.modelAllowanceBB.toFixed(1)} BB
              的模型敏感性空间，用来缓和范围及后续行动近似的影响；它是启发式预留，并非统计置信区间。
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
  const [drawer, setDrawer] = useState<'settings' | 'review' | null>(null);
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
  const [reviewError, setReviewError] = useState(false);
  const [reviewAttempt, setReviewAttempt] = useState(0);
  const [archive, setArchive] = useState<StoredHand | null>(null);
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const soundRef = useRef<AudioContext | null>(null);
  const musicRef = useRef<HoldemLoungeMusic | null>(null);
  const counted = useRef<HoldemState | null>(null);
  const reviewed = useRef<HoldemState | null>(null);
  const mounted = useRef(true);
  const getStrategy = usePokerWorker();
  const completed = state?.street === 'complete';
  const humanTurn = state?.toAct === 0 && !paused;
  const legal = state ? legalActions(state) : null;
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
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void getStrategy<{ action: PokerAction }>({
      type: 'bot',
      state,
      seat,
      style: STYLES[seat],
      difficulty: handDifficulty,
      styles: STYLES,
    })
      .then(({ action }) => {
        if (cancelled) return;
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
            current === state ? act(current, action) : current,
          );
        };
        timer = setTimeout(advance, voice ? 1150 : 620);
      })
      .catch(() => {
        if (!cancelled) setNotice('AI 计算暂时不可用，请暂停后继续。');
      });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [state, paused, handDifficulty, getStrategy, voice]);

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
    void getStrategy<ReviewPoint[]>({
      type: 'review',
      state,
      difficulty: handDifficulty,
      styles: STYLES,
    })
      .then((points) => {
        if (cancelled) return;
        setReview(points);
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
          };
          setPractice((p) => ({
            ...p,
            recent: [hand, ...p.recent].slice(0, 8),
          }));
        }
      })
      .catch(() => {
        if (!cancelled) setReviewError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [state, getStrategy, reviewAttempt, tone, handDifficulty, handConfig]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(practice));
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
      setReviewError(false);
      setArchive(null);
      setNotice('');
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
  const average = shownReview?.length
    ? Math.round(
        shownReview.reduce((sum, point) => sum + point.score, 0) /
          shownReview.length,
      )
    : null;
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

  function openDrawer(which: 'settings' | 'review') {
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
                  {config.initialStack / config.bigBlind} BB ·
                  难度、人数和盲注均可设置
                </p>
              </div>
              <button
                type="button"
                className="poker-secondary"
                onClick={() => openDrawer('settings')}
              >
                <Settings2 size={16} />
                设置牌桌
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
                  {average === null
                    ? '正在整理你的决策…'
                    : `本手平均模型评分 ${average} / 100`}
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
                          : `跟注 ${legal?.call} · 静态门槛 ${pct(legal?.potOdds ?? 0)}`
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
          {notice && (
            <p className="poker-action-error" role="alert">
              {notice}
            </p>
          )}
        </section>
      </main>
      <footer className="poker-footer">
        <span>虚拟筹码 · 本地 AI · 近似策略训练</span>
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
                : '每个选择，都有来由。'}
            </h2>
            <button type="button" onClick={closeDrawer} aria-label="关闭面板">
              <X size={20} />
            </button>
          </header>
          {drawer === 'settings' ? (
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
                  <h3>逐个选择，拆开思路。</h3>
                </div>
                <p>
                  {average !== null ? (
                    <>
                      <b>{average}</b> / 100 平均模型评分
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
                    <p>复盘暂时不可用，完整行动线仍可查看。</p>
                    <button
                      type="button"
                      onClick={() => {
                        setReviewError(false);
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
                        {pot.winners.map((seat) => SEAT_NAMES[seat]).join('、')}
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
                分数是当前范围和简化后续模型中的相对评价。100
                分表示接近候选中的最好选择，不是获胜概率或 GTO
                认证；近似模型存在范围和未来行动误差。
              </p>
              <div className="poker-practice-record">
                <strong>{practice.hands} 手</strong>
                <span>盈利 {practice.wins} 手</span>
                <span>
                  累计 {practice.net >= 0 ? '+' : ''}
                  {practice.net}
                </span>
                <small>
                  {storageAvailable
                    ? '本机保留最近 8 手；历史五人桌记录仍在。'
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
