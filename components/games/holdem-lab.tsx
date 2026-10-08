'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
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
  SEATS,
  STREET_LABELS,
  type HoldemState,
  type PokerAction,
  type Seat,
  type SeatValues,
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
import './holdem-lab.css';

type StoredHand = {
  hand: number;
  delta: number;
  hero: number[];
  board: number[];
  points: ReviewPoint[];
  difficulty: AiDifficulty;
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
const SEAT_NAMES: SeatValues<string> = ['你', '循环', '灯塔', '疾风', '帷幕'];
const STYLES: BotStyle[] = [...DEFAULT_SEAT_STYLES];
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

function TableSeat({
  seat,
  state,
  paused,
}: {
  seat: Seat;
  state: HoldemState | null;
  paused: boolean;
}) {
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
  return (
    <div
      className={`poker-seat poker-seat-${seat} ${hero ? 'is-hero' : ''} ${folded ? 'is-folded' : ''} ${active ? 'is-acting' : ''} ${winner ? 'is-winner' : ''}`}
      aria-label={`${SEAT_NAMES[seat]}席位${active ? '，正在行动' : ''}${folded ? '，已弃牌' : ''}`}
    >
      <div className="poker-seat-identity">
        <span className={`poker-avatar avatar-${seat}`} aria-hidden="true">
          {hero ? '你' : <Cpu size={16} strokeWidth={1.5} />}
        </span>
        <span>
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
            · {hero ? '玩家' : BOT_STYLES[STYLES[seat]].label}
          </small>
        </span>
        <b className="poker-seat-stack">
          {state?.stacks[seat] ?? 1000}
          <small>筹码</small>
        </b>
      </div>
      <div className="poker-seat-bottom">
        <div className="poker-hole" aria-label={`${SEAT_NAMES[seat]}的手牌`}>
          {(state?.holes[seat] ?? [undefined, undefined]).map((c, i) => (
            <PlayingCard
              key={c ?? i}
              card={c}
              hidden={!showCards || c === undefined}
              small={!hero}
            />
          ))}
        </div>
        <div className="poker-seat-state">
          <span>
            {folded
              ? '已弃牌'
              : allIn
                ? '全下'
                : winner
                  ? `收回 ${state?.result?.payouts[seat]}`
                  : active
                    ? hero
                      ? '轮到你'
                      : '思考中…'
                    : latest
                      ? actionLabel(latest)
                      : state
                        ? '等待行动'
                        : '等待发牌'}
          </span>
          {state?.streetBets[seat] && !completed ? (
            <small>本轮 {state.streetBets[seat]}</small>
          ) : completed && showCards && state?.result?.labels[seat] ? (
            <small>{state.result.labels[seat]}</small>
          ) : null}
        </div>
      </div>
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
          <small>模型评分</small>
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
        <p>{point.advice}</p>
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
                  <td>{Math.round(option.score)}</td>
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

export function HoldemLab() {
  const [state, setState] = useState<HoldemState | null>(null);
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
      ) as { difficulty?: AiDifficulty; volume?: number };
      if (
        typeof settings.difficulty === 'string' &&
        Object.hasOwn(AI_DIFFICULTIES, settings.difficulty)
      )
        setDifficulty(settings.difficulty);
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
        void soundRef.current?.suspend();
      }
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      mounted.current = false;
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
        timer = setTimeout(() => {
          if (!cancelled)
            setState((current) =>
              current === state ? act(current, action) : current,
            );
        }, 520);
      })
      .catch(() => {
        if (!cancelled) setNotice('AI 计算暂时不可用，请暂停后继续。');
      });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [state, paused, handDifficulty, getStrategy]);

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
  }, [state, getStrategy, reviewAttempt, tone, handDifficulty]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(practice));
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ difficulty, volume: musicVolume }),
      );
    } catch {
      // oxlint-disable-next-line react/react-compiler -- Reflect browser storage failure.
      setStorageAvailable(false);
    }
  }, [practice, difficulty, musicVolume, ready]);

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
    const stacks = (
      state
        ? state.stacks.map((stack) => (stack < 10 ? 1000 : stack))
        : [1000, 1000, 1000, 1000, 1000]
    ) as SeatValues<number>;
    setState(
      startHand({
        hand: state ? state.hand + 1 : 1,
        button: state ? nextButton(state) : 0,
        stacks,
      }),
    );
    setHandDifficulty(difficulty);
    setPaused(false);
    setReview(null);
    setReviewError(false);
    setArchive(null);
    setNotice('');
    tone();
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
  return (
    <div className="holdem-lab">
      <div className="poker-topbar">
        <p>
          <span className="poker-live-dot" aria-hidden="true" />
          五人练习桌 <span>虚拟筹码 · 盲注 5 / 10</span>
        </p>
        <div className="poker-utilities">
          {(state || music) && (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-pressed={paused}
            >
              {paused ? <Play size={15} /> : <Pause size={15} />}
              {paused ? '继续' : '暂停'}
            </button>
          )}
          <button
            type="button"
            className={music ? 'is-on' : ''}
            onClick={toggleMusic}
            aria-pressed={music}
            aria-label={music ? '关闭背景音乐' : '打开背景音乐'}
          >
            <Music2 size={16} />
            <span>音乐</span>
          </button>
          <button
            type="button"
            onClick={() => setSound((v) => !v)}
            aria-pressed={sound}
            aria-label={sound ? '关闭游戏音效' : '打开游戏音效'}
          >
            {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
        </div>
      </div>
      <div className="poker-layout">
        <section
          className={`poker-table-wrap ${paused ? 'is-paused' : ''}`}
          aria-label="五人德州扑克练习桌"
        >
          <div className="poker-table">
            {SEATS.map((seat) => (
              <TableSeat seat={seat} key={seat} state={state} paused={paused} />
            ))}
            <div className="poker-center">
              <div className="poker-pot">
                <span>
                  {state ? STREET_LABELS[state.street] : 'NO LIMIT HOLD’EM'}
                </span>
                <strong>
                  {state ? (state.result?.pot ?? potSize(state)) : '5 人桌'}
                </strong>
                <small>{state ? '底池筹码' : '一位玩家，四种性格'}</small>
              </div>
              <div className="poker-board" aria-label="公共牌">
                {Array.from({ length: 5 }, (_, i) =>
                  state?.board[i] !== undefined ? (
                    <PlayingCard key={i} card={state.board[i]} />
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
                  ? '先打一手，再回看每个选择。'
                  : paused
                    ? '练习已暂停'
                    : completed
                      ? `${state.result?.winners.map((s) => SEAT_NAMES[s]).join('、')} ${state.result?.winners.length === 1 ? '赢下底池' : '分享底池'}`
                      : state.toAct === 0
                        ? '轮到你行动'
                        : `${state.toAct === null ? 'AI' : SEAT_NAMES[state.toAct]}正在思考…`}
              </output>
              {state && !completed && (
                <small className="poker-live-count">
                  {state.folded.filter((f) => !f).length} 位仍在底池 ·{' '}
                  {AI_DIFFICULTIES[handDifficulty].label}
                </small>
              )}
            </div>
          </div>
          <div className="poker-action-panel">
            {!state ? (
              <div className="poker-start">
                <div>
                  <h2>五个席位，更多博弈。</h2>
                  <p>观察位置与不同对手，逐个选择拆开复盘。</p>
                </div>
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
                    {delta} 筹码
                  </strong>
                  <p>
                    {state.stacks.some((s) => s < 10)
                      ? '筹码不足的席位下一手补充至 100 BB。'
                      : '按钮位轮换，先回看当时的选择。'}
                  </p>
                </div>
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
              <>
                <div className="poker-turn-caption">
                  <span>
                    {paused
                      ? '点击继续恢复对局'
                      : state.folded[0]
                        ? '你已弃牌，观察其他席位的行动。'
                        : humanTurn
                          ? legal?.canCheck
                            ? '可以免费过牌，也可以主动下注。'
                            : `跟注需 ${legal?.call} 筹码${legal?.call === state.stacks[0] ? '（全下）' : ''}`
                          : `等待${state.toAct === null ? '其他席位' : SEAT_NAMES[state.toAct]}行动`}
                  </span>
                  <small>第 {state.hand} 手</small>
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
                      Math.max(...state.streetBets) === 10 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setRaiseTo(
                              Math.min(legal.maxTo, Math.max(legal.minTo, 25)),
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
                        onChange={(e) => setRaiseTo(Number(e.target.value))}
                      />
                      <output>{raiseTo}</output>
                    </label>
                  </div>
                )}
              </>
            )}
            <p className="poker-action-error" role="alert">
              {notice}
            </p>
            {completed &&
              state?.result &&
              (state.result.pots.length > 1 ||
                state.result.returned.some((n) => n > 0)) && (
                <details className="poker-pot-breakdown">
                  <summary>
                    底池分配 <ChevronDown size={14} />
                  </summary>
                  {state.result.pots.map((pot, i) => (
                    <p key={i}>
                      {i === 0 ? '主池' : `边池 ${i}`} {pot.amount} →{' '}
                      {pot.winners.map((s) => SEAT_NAMES[s]).join('、')}
                    </p>
                  ))}
                  {SEATS.filter((s) => state.result!.returned[s] > 0).map(
                    (s) => (
                      <p key={s}>
                        {SEAT_NAMES[s]}未被跟注的 {state.result!.returned[s]}{' '}
                        已退回。
                      </p>
                    ),
                  )}
                </details>
              )}
          </div>
        </section>
        <aside className="poker-side" aria-label="难度设置与行动记录">
          <section className="poker-settings">
            <h2>AI 难度</h2>
            <fieldset
              className="poker-difficulty-options"
              aria-label="选择下一手 AI 难度"
            >
              {(Object.keys(AI_DIFFICULTIES) as AiDifficulty[]).map((level) => (
                <button
                  type="button"
                  key={level}
                  aria-pressed={difficulty === level}
                  onClick={() => setDifficulty(level)}
                >
                  {AI_DIFFICULTIES[level].label}
                </button>
              ))}
            </fieldset>
            <p>{AI_DIFFICULTIES[difficulty].description}</p>
            {state && !completed && (
              <small className="poker-pending-setting">
                {difficulty !== handDifficulty
                  ? `下一手切换为${AI_DIFFICULTIES[difficulty].label}；本手保持${AI_DIFFICULTIES[handDifficulty].label}。`
                  : '修改在下一手生效。'}
              </small>
            )}
          </section>
          <section className="poker-opponents">
            <h2>桌上的四种性格</h2>
            <ul>
              {SEATS.filter((s) => s !== 0).map((s) => (
                <li key={s}>
                  <span className={`poker-personality-marker avatar-${s}`} />
                  <strong>{SEAT_NAMES[s]}</strong>
                  <small>{BOT_STYLES[STYLES[s]].label}</small>
                </li>
              ))}
            </ul>
          </section>
          <section className="poker-price">
            <h2>当前价格</h2>
            {legal && humanTurn && legal.call > 0 ? (
              <>
                <strong>{pct(legal.potOdds)}</strong>
                <p>
                  跟注 {legal.call}，争夺跟注后 {legal.pot + legal.call}{' '}
                  的可争夺底池。
                </p>
                <small>静态门槛，未计入未来行动与权益实现。</small>
              </>
            ) : (
              <>
                <strong>
                  {completed ? '复盘时间' : humanTurn ? '免费过牌' : '等待行动'}
                </strong>
                <p>先考虑位置、底池中的人数和对手的公开行动。</p>
              </>
            )}
          </section>
          <section className="poker-music-settings">
            <h2>桌边音乐</h2>
            <p>低音、电钢琴与轻刷鼓，安静地陪你想一手牌。</p>
            <label>
              <span>音量</span>
              <input
                type="range"
                min="0"
                max="60"
                step="1"
                value={Math.round(musicVolume * 100)}
                onChange={(e) => setMusicVolume(Number(e.target.value) / 100)}
                aria-label="背景音乐音量"
              />
              <output>{Math.round(musicVolume * 100)}%</output>
            </label>
            <small>
              {music
                ? paused
                  ? '随练习暂停，继续后恢复。'
                  : '正在播放 · 原创桌边旋律'
                : '默认关闭，点击上方音乐按钮开启。'}
            </small>
          </section>
          <section className="poker-log">
            <h2>最近行动</h2>
            {state?.actions.length ? (
              <ol>
                {state.actions.slice(-6).map((d, i) => (
                  <li
                    key={`${state.actions.length - 6 + i}`}
                    className={d.seat === 0 ? 'is-human' : ''}
                  >
                    <small>{STREET_LABELS[d.street]}</small>
                    <span>
                      {SEAT_NAMES[d.seat]} · {actionLabel(d)}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p>发牌后，这里会留下每位玩家的行动。</p>
            )}
            <output className="poker-screen-reader" aria-live="polite">
              {latest
                ? `${SEAT_NAMES[latest.seat]} ${actionLabel(latest)}`
                : ''}
            </output>
          </section>
          <details className="poker-rules">
            <summary>
              规则与复盘说明 <ChevronDown size={15} />
            </summary>
            <p>
              用两张手牌与公共牌组成最佳五张牌。按钮之后依次为小盲、大盲；翻牌前由大盲之后先行动，翻牌后由按钮之后尚未弃牌的席位先行动。
            </p>
            <p>
              滑块表示本轮累计投入。全下金额不同时按主池、边池分别结算；弃牌后仍会等待其他席位完成对局。
            </p>
            <p>
              AI
              使用自己的手牌与公开行动推测范围，不能读取你的底牌。难度改变范围与行动策略，不改变发牌。
            </p>
            <p>
              复盘分数比较模型候选行动的估计
              EV，不根据最后输赢打分。这里没有运行严格 GTO
              求解器，也没有大模型。
            </p>
            <a
              href="https://www.pokertda.com/view-poker-tda-rules/"
              target="_blank"
              rel="noreferrer"
            >
              规则参考 ↗
            </a>
          </details>
        </aside>
      </div>
      <section className="poker-review" aria-labelledby="poker-review-heading">
        <header>
          <div>
            <BookOpen size={19} />
            <h2 id="poker-review-heading">逐个选择，拆开思路。</h2>
          </div>
          <p>
            {average !== null ? (
              <>
                <b>{average}</b> / 100 本手平均模型评分
              </>
            ) : (
              '只看决策时已知的信息。'
            )}
          </p>
        </header>
        {practice.recent.length > 0 && (
          <fieldset className="poker-history" aria-label="选择最近的练习记录">
            <button
              type="button"
              aria-pressed={!archive}
              onClick={() => setArchive(null)}
            >
              当前对局
            </button>
            {practice.recent.map((h, i) => (
              <button
                type="button"
                key={`${h.hand}-${i}`}
                aria-pressed={archive === h}
                onClick={() => setArchive(h)}
              >
                记录 {practice.hands - i}
                <small>
                  {h.delta >= 0 ? '+' : ''}
                  {h.delta}
                </small>
              </button>
            ))}
          </fieldset>
        )}
        {archive && (
          <div className="poker-review-cards">
            <span>{AI_DIFFICULTIES[archive.difficulty].label} · 记录手牌</span>
            {archive.hero.map((c) => (
              <PlayingCard card={c} key={c} small />
            ))}
            <span>结束公共牌</span>
            {archive.board.map((c) => (
              <PlayingCard card={c} key={c} small />
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
              本手在你行动前已经结束，下一手再观察自己的决策。
            </p>
          )
        ) : completed ? (
          reviewError ? (
            <div className="poker-empty-review">
              <p>复盘暂时不可用，完整行动记录仍可查看。</p>
              <button
                type="button"
                onClick={() => {
                  setReviewError(false);
                  setReviewAttempt((n) => n + 1);
                }}
              >
                <RotateCcw size={15} />
                重试复盘
              </button>
            </div>
          ) : (
            <p className="poker-empty-review">
              <LoaderCircle className="poker-spinner" size={20} />
              正在计算各个选择的范围、候选行动与评分…
            </p>
          )
        ) : (
          <p className="poker-empty-review">
            <Spade size={22} />
            完成一手牌后，查看每个行动的模型评分、候选尺度和思路解析。
          </p>
        )}
        {state?.actions.length ? (
          <details className="poker-hand-timeline">
            <summary>
              当前手完整行动线 <ChevronDown size={15} />
            </summary>
            <ol>
              {state.actions.map((d, i) => (
                <li key={i} className={d.seat === 0 ? 'is-human' : ''}>
                  <small>{STREET_LABELS[d.street]}</small>
                  <span>{SEAT_NAMES[d.seat]}</span>
                  <strong>{actionLabel(d)}</strong>
                  <span>底池 {d.pot}</span>
                </li>
              ))}
            </ol>
          </details>
        ) : null}
        <p className="poker-review-limit">
          评分是当前范围与简化后续模型中的相对评价；100
          分表示接近候选中的最好行动，不是获胜概率或已求解的 GTO
          结论。范围推断、权益实现和对手应对都有误差，多人博弈尤其需要保留判断。结果不会被用于倒推评分。
        </p>
      </section>
      <div className="poker-practice-record">
        <span>本机五人桌记录</span>
        <strong>{practice.hands} 手</strong>
        <span>盈利 {practice.wins} 手</span>
        <span>
          累计 {practice.net >= 0 ? '+' : ''}
          {practice.net} 虚拟筹码
        </span>
        <small>
          {storageAvailable
            ? '最近 8 手可回看，仅保存在当前浏览器。'
            : '浏览器禁止本地存储，仅在本次页面内保留。'}
        </small>
      </div>
    </div>
  );
}
