'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Cpu,
  LoaderCircle,
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
  estimateEquity,
  type EquityEstimate,
} from '@/lib/games/holdem-cards';
import {
  act,
  actionLabel,
  legalActions,
  potSize,
  startHand,
  STREET_LABELS,
  type HoldemState,
  type PokerAction,
} from '@/lib/games/holdem-engine';
import {
  BOT_STYLES,
  chooseBotAction,
  nextButton,
  pct,
  positionLabel,
  quickEquity,
  reviewHand,
  type BotStyle,
  type ReviewPoint,
} from '@/lib/games/holdem-strategy';
import './holdem-lab.css';

type StoredHand = {
  hand: number;
  delta: number;
  hero: number[];
  board: number[];
  points: ReviewPoint[];
};
type Practice = {
  hands: number;
  wins: number;
  net: number;
  recent: StoredHand[];
};
const EMPTY_PRACTICE: Practice = { hands: 0, wins: 0, net: 0, recent: [] };
const STORAGE_KEY = 'tscjj:holdem-practice:v1';
type Job =
  | { type: 'equity'; hole: number[]; board: number[] }
  | { type: 'review'; state: HoldemState };

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
        <Spade size={small ? 18 : 25} aria-hidden="true" />
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
  const pending = useRef(
    new Map<
      number,
      { resolve: (result: unknown) => void; reject: (error: Error) => void }
    >(),
  );
  useEffect(() => {
    let instance: Worker | null = null;
    try {
      instance = new Worker(new URL('./holdem-worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.current = instance;
      instance.onmessage = (
        event: MessageEvent<{ id: number; result?: unknown; error?: string }>,
      ) => {
        const task = pending.current.get(event.data.id);
        if (!task) return;
        pending.current.delete(event.data.id);
        if (event.data.error) task.reject(new Error(event.data.error));
        else task.resolve(event.data.result);
      };
      instance.onerror = () => {
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
    return () => {
      instance?.terminate();
      worker.current = null;
      for (const task of tasks.values()) task.reject(new Error('页面已离开'));
      tasks.clear();
    };
  }, []);
  return useCallback(
    <T,>(job: Job): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        if (!worker.current) {
          reject(new Error('计算线程不可用'));
          return;
        }
        const id = ++serial.current;
        pending.current.set(id, {
          resolve: (result) => resolve(result as T),
          reject,
        });
        worker.current.postMessage({ ...job, id });
      }).catch(() => {
        // Some browsers block module workers; the small local calculation still keeps play available.
        return (
          job.type === 'equity'
            ? estimateEquity(job.hole, job.board, 280)
            : reviewHand(job.state, 360)
        ) as T;
      }),
    [],
  );
}

function readPractice(): Practice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw || raw.length > 200000) return EMPTY_PRACTICE;
    const saved = JSON.parse(raw) as Practice;
    if (
      ![saved.hands, saved.wins, saved.net].every(Number.isFinite) ||
      saved.hands < 0 ||
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
            Array.isArray(h.hero) &&
            h.hero.length === 2 &&
            Array.isArray(h.board) &&
            h.board.length <= 5 &&
            [...h.hero, ...h.board].every(
              (c) => Number.isInteger(c) && c >= 0 && c < 52,
            ) &&
            Array.isArray(h.points) &&
            h.points.length <= 60 &&
            h.points.every(
              (p) =>
                p &&
                Number.isFinite(p.equity) &&
                typeof p.advice === 'string' &&
                typeof p.principle === 'string' &&
                typeof p.title === 'string' &&
                typeof p.action === 'string' &&
                Array.isArray(p.board) &&
                p.board.length <= 5 &&
                p.board.every((c) => Number.isInteger(c) && c >= 0 && c < 52) &&
                p.street in STREET_LABELS,
            ),
        ),
    };
  } catch {
    return EMPTY_PRACTICE;
  }
}

export function HoldemLab() {
  const [state, setState] = useState<HoldemState | null>(null);
  const [style, setStyle] = useState<BotStyle>('balanced');
  const [paused, setPaused] = useState(false);
  const [sound, setSound] = useState(false);
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
  const counted = useRef<HoldemState | null>(null);
  const reviewed = useRef<HoldemState | null>(null);
  const getStrategy = usePokerWorker();
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
  const humanTurn = state?.toAct === 0 && !paused;
  const completed = state?.street === 'complete';

  useEffect(() => {
    // oxlint-disable-next-line react/react-compiler -- Browser-only storage must hydrate after the shared server/client initial render.
    setPractice(readPractice());
    setReady(true);
  }, []);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) setPaused(true);
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      void soundRef.current?.close();
    };
  }, []);

  const tone = useCallback(
    (win = false) => {
      if (!sound) return;
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
        gain.gain.setValueAtTime(0.045, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          context.currentTime + 0.13,
        );
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.14);
      } catch {
        /* Sound is optional; play stays available. */
      }
    },
    [sound],
  );

  useEffect(() => {
    if (!state || state.toAct !== 1 || paused) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const decide = (equity: number) => {
      if (cancelled) return;
      const action = chooseBotAction(state, equity, style);
      timer = setTimeout(() => {
        if (!cancelled)
          setState((current) =>
            current === state ? act(current, action) : current,
          );
      }, 500);
    };
    void getStrategy<EquityEstimate>({
      type: 'equity',
      hole: state.holes[1],
      board: state.board,
    })
      .then((result) => decide(result.equity))
      .catch(() => decide(quickEquity(state.holes[1])));
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [state, paused, style, getStrategy]);

  useEffect(() => {
    if (!state?.result) return;
    if (counted.current !== state) {
      counted.current = state;
      const delta = state.stacks[0] - state.startingStacks[0];
      // oxlint-disable-next-line react/react-compiler -- Persist exactly one completed engine snapshot, independent of later review retries.
      setPractice((p) => ({
        ...p,
        hands: p.hands + 1,
        wins: p.wins + Number(state.result!.winner === 0),
        net: p.net + delta,
      }));
      tone(state.result.winner === 0);
    }
    let cancelled = false;
    void getStrategy<ReviewPoint[]>({ type: 'review', state })
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
  }, [state, getStrategy, reviewAttempt, tone]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(practice));
    } catch {
      // oxlint-disable-next-line react/react-compiler -- Reflect a browser storage failure; this does not depend on rendered state.
      setStorageAvailable(false);
    }
  }, [practice, ready]);

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
    const resetStacks = !state || state.stacks.some((s) => s < 10);
    setState(
      startHand({
        hand: state ? state.hand + 1 : 1,
        button: state ? nextButton(state) : 0,
        stacks: resetStacks ? [1000, 1000] : state.stacks,
      }),
    );
    setPaused(false);
    setReview(null);
    setReviewError(false);
    setArchive(null);
    setNotice('');
    tone();
  }

  function setSize(fraction: number) {
    if (!legal || !state) return;
    const target =
      Math.max(...state.streetBets) +
      Math.round((legal.pot + legal.call) * fraction);
    setRaiseTo(Math.min(legal.maxTo, Math.max(legal.minTo, target)));
  }

  const latest = state?.actions.at(-1);
  const shownReview = archive?.points || review;
  return (
    <div className="holdem-lab">
      <div className="poker-topbar">
        <p>
          <span className="poker-live-dot" aria-hidden="true" />
          单机练习桌 <span>虚拟筹码 / 盲注 5、10</span>
        </p>
        <div className="poker-utilities">
          {state && !completed && (
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
            onClick={() => {
              setSound((v) => !v);
            }}
            aria-pressed={sound}
            aria-label={sound ? '关闭游戏音效' : '打开游戏音效'}
          >
            {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
        </div>
      </div>
      <div className="poker-layout">
        <section
          className={`poker-table-wrap ${paused && !completed ? 'is-paused' : ''}`}
          aria-label="德州扑克练习桌"
        >
          <div className="poker-table">
            <div className="poker-seat poker-bot">
              <div className="poker-seat-info">
                <span className="poker-cpu">
                  <Cpu size={20} strokeWidth={1.5} />
                </span>
                <span>
                  <strong>AI 对手</strong>
                  <small>
                    {state ? positionLabel(state, 1) : '与你进行单挑练习'} /{' '}
                    {BOT_STYLES[style].label}
                  </small>
                </span>
                <b>
                  {state?.stacks[1] ?? 1000}
                  <small>筹码</small>
                </b>
              </div>
              <div className="poker-hole" aria-label="AI 对手手牌">
                {state ? (
                  state.holes[1].map((c) => (
                    <PlayingCard
                      key={c}
                      card={c}
                      hidden={!completed || state.result?.reason !== 'showdown'}
                      small
                    />
                  ))
                ) : (
                  <>
                    <PlayingCard hidden small />
                    <PlayingCard hidden small />
                  </>
                )}
              </div>
              {state?.streetBets[1] ? (
                <span className="poker-wager">本轮 {state.streetBets[1]}</span>
              ) : null}
            </div>
            <div className="poker-center">
              <div className="poker-pot">
                <span>{state ? STREET_LABELS[state.street] : '德州扑克'}</span>
                <strong>
                  {state ? (state.result?.pot ?? potSize(state)) : '1 vs 1'}
                </strong>
                <small>{state ? '底池筹码' : '牌力、位置与决策'}</small>
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
                  ? '从一手牌开始，结束后再回看你的选择。'
                  : completed
                    ? state.result?.winner === 'tie'
                      ? '平分底池'
                      : state.result?.winner === 0
                        ? '你赢下了这一手'
                        : 'AI 赢下了这一手'
                    : paused
                      ? '练习已暂停'
                      : state.toAct === 1
                        ? 'AI 正在思考…'
                        : '轮到你行动'}
              </output>
              {completed && state.result?.reason === 'showdown' && (
                <p className="poker-showdown">
                  你：{state.result.labels[0]}{' '}
                  <span>AI：{state.result.labels[1]}</span>
                </p>
              )}
              {completed &&
                state.result &&
                state.result.returned.some((n) => n > 0) && (
                  <p className="poker-returned">
                    未被跟注的 {Math.max(...state.result.returned)} 筹码已退回。
                  </p>
                )}
            </div>
            <div className="poker-seat poker-human">
              <div className="poker-hole" aria-label="你的手牌">
                {state ? (
                  state.holes[0].map((c) => <PlayingCard key={c} card={c} />)
                ) : (
                  <>
                    <PlayingCard hidden />
                    <PlayingCard hidden />
                  </>
                )}
              </div>
              <div className="poker-seat-info">
                <span className="poker-you">你</span>
                <span>
                  <strong>你的席位</strong>
                  <small>
                    {state ? positionLabel(state, 0) : '100 BB 起始筹码'}
                  </small>
                </span>
                <b>
                  {state?.stacks[0] ?? 1000}
                  <small>筹码</small>
                </b>
              </div>
              {state?.streetBets[0] && !completed ? (
                <span className="poker-wager">本轮 {state.streetBets[0]}</span>
              ) : null}
            </div>
            {state && state.button === 0 && (
              <span className="poker-dealer is-human" title="按钮位">
                D
              </span>
            )}
            {state && state.button === 1 && (
              <span className="poker-dealer is-bot" title="按钮位">
                D
              </span>
            )}
          </div>
          <div className="poker-action-panel">
            {!state ? (
              <div className="poker-start">
                <div>
                  <h2>先打一手，再拆开思路。</h2>
                  <p>两张手牌、五张公共牌。只用虚拟筹码，不设倒计时。</p>
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
                    {state.stacks[0] - state.startingStacks[0] >= 0 ? '+' : ''}
                    {state.stacks[0] - state.startingStacks[0]} 筹码
                  </strong>
                  <p>
                    {state.stacks.some((s) => s < 10)
                      ? '本轮筹码不足，下一手补充到各 100 BB。'
                      : '按钮位下一手轮换。可以先阅读本手复盘。'}
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
                      : humanTurn
                        ? legal?.canCheck
                          ? '你可以免费过牌，也可以主动下注。'
                          : `跟注需 ${legal?.call} 筹码${legal?.call === state.stacks[0] ? '（全下）' : ''}`
                        : '等待 AI 的行动'}
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
                    {legal?.canCheck ? '过牌' : `跟注 ${legal?.call ?? ''}`}{' '}
                    <kbd>C</kbd>
                  </button>
                  <button
                    type="button"
                    className="poker-primary"
                    onClick={() => play({ type: 'raise', to: raiseTo })}
                    disabled={!humanTurn || !legal?.canRaise}
                  >
                    {state.streetBets[1] === 0 ? '下注' : '加注到'}{' '}
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
                      <span>总下注</span>
                      <input
                        type="range"
                        aria-label="调整本轮总下注额度"
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
                <p className="poker-action-error" role="alert">
                  {notice}
                </p>
              </>
            )}
          </div>
        </section>
        <aside className="poker-side" aria-label="练习设置与决策参考">
          <section className="poker-settings">
            <h2>练习对手</h2>
            <fieldset
              className="poker-style-options"
              aria-label="选择 AI 对手风格"
            >
              {(Object.keys(BOT_STYLES) as BotStyle[]).map((s) => (
                <button
                  type="button"
                  key={s}
                  disabled={Boolean(state && !completed)}
                  aria-pressed={style === s}
                  onClick={() => setStyle(s)}
                >
                  {BOT_STYLES[s].label}
                </button>
              ))}
            </fieldset>
            <p>
              {BOT_STYLES[style].description}{' '}
              {state && !completed && '本手结束后可切换。'}
            </p>
          </section>
          <section className="poker-price">
            <h2>当前价格</h2>
            {legal && humanTurn && legal.call > 0 ? (
              <>
                <strong>{pct(legal.potOdds)}</strong>
                <p>
                  跟注 {legal.call}，争夺跟注后 {legal.pot + legal.call}{' '}
                  的底池。
                </p>
                <small>静态权益门槛，尚未计入未来下注。</small>
              </>
            ) : (
              <>
                <strong>
                  {completed ? '复盘时间' : humanTurn ? '免费过牌' : '等待行动'}
                </strong>
                <p>先考虑你的牌、所在位置，以及对手可能持有的范围。</p>
              </>
            )}
          </section>
          <section className="poker-log">
            <h2>最近行动</h2>
            {state?.actions.length ? (
              <ol>
                {state.actions.slice(-5).map((d, i) => (
                  <li key={`${state.actions.length - 5 + i}`}>
                    <small>{STREET_LABELS[d.street]}</small>
                    <span>
                      {d.seat === 0 ? '你' : 'AI'} · {actionLabel(d)}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p>行动后会在这里留下记录。</p>
            )}
            <output className="poker-screen-reader" aria-live="polite">
              {latest
                ? `${latest.seat === 0 ? '你' : 'AI'} ${actionLabel(latest)}`
                : ''}
            </output>
          </section>
          <details className="poker-rules">
            <summary>
              怎样玩与怎样复盘 <ChevronDown size={15} />
            </summary>
            <p>
              用两张手牌与公共牌组成最佳五张牌。单挑时，按钮位付小盲并在翻牌前先行动，翻牌后由大盲先行动。
            </p>
            <p>
              你可以弃牌、过牌、跟注或加注。下注滑块表示本轮累计投入，最小加注按上一完整加注增量计算。
            </p>
            <p>
              AI 使用本地牌力估计与混合策略；复盘参考 GTO
              的范围、赔率与尺度思路。当前未运行 GTO 求解器，也未接入大模型。
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
          <span>
            <BookOpen size={19} />
            <h2 id="poker-review-heading">逐手复盘</h2>
          </span>
          <p>先看当时的决策，再看最后的结果。</p>
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
                记录 {practice.hands - i}{' '}
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
            <span>记录中的手牌</span>
            {archive.hero.map((c) => (
              <PlayingCard card={c} key={c} small />
            ))}
            <span>公共牌</span>
            {archive.board.map((c) => (
              <PlayingCard card={c} key={c} small />
            ))}
          </div>
        )}
        {shownReview ? (
          shownReview.length > 0 ? (
            <div className="poker-review-list">
              {shownReview.map((point, i) => (
                <details
                  key={`${archive?.hand || state?.hand}-${point.index}`}
                  className="poker-review-point"
                  open={i === 0}
                >
                  <summary>
                    <span className="poker-review-street">
                      {STREET_LABELS[point.street]}
                    </span>
                    <span>
                      <strong>{point.action}</strong>
                      <small>{point.title}</small>
                    </span>
                    <ChevronDown size={17} />
                  </summary>
                  <div className="poker-review-body">
                    <div className="poker-decision-board">
                      <span className="poker-board-caption">当时公共牌</span>
                      {point.board.length ? (
                        point.board.map((card) => (
                          <PlayingCard key={card} card={card} small />
                        ))
                      ) : (
                        <small>翻牌前，尚未发出</small>
                      )}
                    </div>
                    <div className="poker-review-metrics">
                      <span>
                        随机范围估计权益 <b>{pct(point.equity)}</b>
                      </span>
                      {point.threshold !== null && (
                        <span>
                          静态跟注门槛 <b>{pct(point.threshold)}</b>
                        </span>
                      )}
                      <span>
                        决策时底池 <b>{point.pot}</b>
                      </span>
                    </div>
                    <p>{point.advice}</p>
                    <p className="poker-principle">{point.principle}</p>
                  </div>
                </details>
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
              <p>复盘计算暂时不可用；你仍可查看行动记录。</p>
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
              正在整理本手决策…
            </p>
          )
        ) : (
          <p className="poker-empty-review">
            <Spade size={22} />
            完成一手牌后，这里会展开你的行动与策略参考。
          </p>
        )}
        <p className="poker-review-limit">
          复盘基于 {360}{' '}
          次蒙特卡洛抽样，对手假设为随机未知手牌；有抽样误差，也没有按对手的下注收紧范围。它提供赔率与思路参考，不是精确
          GTO 动作频率或多轮 EV。输赢本身不决定行动是否合理。
        </p>
      </section>
      <div className="poker-practice-record">
        <span>本机练习记录</span>
        <strong>{practice.hands} 手</strong>
        <span>赢下 {practice.wins} 手</span>
        <span>
          累计 {practice.net >= 0 ? '+' : ''}
          {practice.net} 虚拟筹码
        </span>
        <small>
          {storageAvailable
            ? '记录仅保存在当前浏览器，最近 8 手可回看。'
            : '浏览器禁止本地存储，记录仅在本次页面内保留。'}
        </small>
      </div>
    </div>
  );
}
