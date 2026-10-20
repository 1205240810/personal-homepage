'use client';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import {
  BookOpen,
  Flag,
  Gauge,
  Hand,
  Lightbulb,
  RotateCcw,
  Undo2,
} from 'lucide-react';
import {
  BLACK,
  EMPTY,
  GO_RECORDS_KEY,
  GO_SIZES,
  WHITE,
  coordName,
  emptyGoRecords,
  komiFor,
  newGame,
  other,
  play,
  recordGoGame,
  recordProblem,
  score,
  toggleDead,
  validateGoRecords,
  type GoSize,
  type GoState,
  type Player,
} from '@/lib/games/go';
import {
  GO_LEVELS,
  chooseGoMove,
  judgeGo,
  resetGoTree,
  shouldResign,
  type GoAiResult,
  type GoJudgment,
  type GoLevel,
} from '@/lib/games/go-ai';
import {
  GO_PROBLEMS,
  correctMoves,
  playerWinning,
  setup,
  whiteReply,
  type ProblemSetup,
} from '@/lib/games/go-problems';
import { useLocalRecords } from './kit';
// Vite provides the default URL export for this worker asset.
// oxlint-disable-next-line import/default
import goWorkerUrl from './go-worker.ts?worker&url';
import './kit.css';
import './go.css';

const EMPTY_RECORDS = emptyGoRecords();

/** 「AI 自动认输」 persists in localStorage. Read through an external store so
 *  the server render and hydration use the default (on), then the saved value. */
export const GO_AUTO_RESIGN_KEY = 'tscjj-go-auto-resign';
const AUTO_RESIGN_EVENT = 'tscjj-go-auto-resign';
// Keep controls usable for this page even when browser storage is denied/full.
let autoResignValue = true;
let autoResignSessionOnly = false;
function readAutoResign() {
  if (!autoResignSessionOnly) {
    try {
      // Anything other than an explicit "0" (missing, corrupt) means on.
      autoResignValue = localStorage.getItem(GO_AUTO_RESIGN_KEY) !== '0';
    } catch {
      // Retain the last known value when storage access becomes unavailable.
    }
  }
  return autoResignValue;
}
function subscribeAutoResign(cb: () => void) {
  const changedElsewhere = (event: StorageEvent) => {
    if (event.key !== null && event.key !== GO_AUTO_RESIGN_KEY) return;
    autoResignValue = event.newValue !== '0';
    autoResignSessionOnly = false;
    cb();
  };
  window.addEventListener('storage', changedElsewhere);
  window.addEventListener(AUTO_RESIGN_EVENT, cb);
  return () => {
    window.removeEventListener('storage', changedElsewhere);
    window.removeEventListener(AUTO_RESIGN_EVENT, cb);
  };
}
function saveAutoResign(on: boolean) {
  autoResignValue = on;
  try {
    localStorage.setItem(GO_AUTO_RESIGN_KEY, on ? '1' : '0');
    autoResignSessionOnly = false;
  } catch {
    // A failed write must not undo the user's choice in the current page.
    autoResignSessionOnly = true;
  }
  window.dispatchEvent(new Event(AUTO_RESIGN_EVENT));
}
const NAME: Record<Player, string> = { 1: '黑', 2: '白' };
const wire = (s: GoState) => ({ ...s, board: Array.from(s.board) });

function useGoAi() {
  const requests = useRef(new Set<() => void>());
  /** The move worker stays alive between moves so the search tree can be reused. */
  const keptWorker = useRef<Worker | null>(null);
  const [compatibility, setCompatibility] = useState(false);
  useEffect(() => {
    const pending = requests.current;
    const kept = keptWorker;
    return () => {
      for (const cancel of pending) cancel();
      kept.current?.terminate();
      kept.current = null;
    };
  }, []);
  function send<T>(
    msg: object,
    fallback: () => T | null,
    timeoutMs: number,
    {
      keep = false,
      reportCompatibility = true,
    }: { keep?: boolean; reportCompatibility?: boolean } = {},
  ) {
    let worker: Worker | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let finish: (result: T | null) => void = () => {};
    const cancel = () => finish(null);
    const pending = requests.current;
    const promise = new Promise<T | null>((resolve) => {
      let done = false;
      finish = (result) => {
        if (done) return;
        done = true;
        if (keep && result !== null && worker) {
          worker.onmessage = null;
          keptWorker.current = worker;
        } else worker?.terminate();
        clearTimeout(timer);
        clearTimeout(watchdog);
        pending.delete(cancel);
        resolve(result);
      };
      const local = () => {
        if (done) return;
        clearTimeout(watchdog);
        clearTimeout(timer);
        if (reportCompatibility) setCompatibility(true);
        worker?.terminate();
        worker = null;
        timer = setTimeout(() => {
          try {
            finish(fallback());
          } catch {
            finish(null);
          }
        }, 0);
      };
      pending.add(cancel);
      try {
        worker =
          keep && keptWorker.current
            ? keptWorker.current
            : new Worker(goWorkerUrl, { type: 'module' });
        if (keep) keptWorker.current = null;
        worker.onmessage = (
          e: MessageEvent<{ result?: T; error?: string }>,
        ) => {
          if (done) return;
          if (e.data.error) local();
          else {
            if (reportCompatibility) setCompatibility(false);
            finish(e.data.result ?? null);
          }
        };
        worker.onerror = (event) => {
          event.preventDefault();
          local();
        };
        worker.onmessageerror = local;
        worker.postMessage({ id: 1, ...msg });
        watchdog = setTimeout(local, timeoutMs);
      } catch {
        local();
      }
    });
    return { promise, cancel };
  }
  return {
    compatibility,
    reset: () => {
      keptWorker.current?.terminate();
      keptWorker.current = null;
      // Compatibility searches run in this realm and keep their own tree too.
      resetGoTree();
    },
    move: (s: GoState, komi: number, level: GoLevel) =>
      send<GoAiResult & { fallback?: true }>(
        { type: 'move', state: wire(s), komi, level },
        () => ({ ...chooseGoMove(s, komi, 1), fallback: true }),
        GO_LEVELS[level].timeMs + 5000,
        { keep: true },
      ),
    judge: (s: GoState, komi: number) =>
      send<GoJudgment>(
        { type: 'judge', state: wire(s), komi },
        () =>
          judgeGo(s, komi, Math.random, () => Date.now(), {
            playouts: 300,
            timeMs: 250,
          }),
        8000,
        // Judgment has its own Worker and must not change the match strength.
        { reportCompatibility: false },
      ),
    dead: (s: GoState) =>
      send<number[]>({ type: 'dead', state: wire(s) }, () => null, 5000),
  };
}

type Phase = 'play' | 'scoring' | 'over';
type Mode = { kind: 'game' } | { kind: 'problem'; index: number };

export function GoGame() {
  const [records, saveRecords] = useLocalRecords(
    GO_RECORDS_KEY,
    validateGoRecords,
    EMPTY_RECORDS,
  );
  const ai = useGoAi();
  const [mode, setMode] = useState<Mode>({ kind: 'game' });
  const [size, setSize] = useState<GoSize>(9);
  const [level, setLevel] = useState<GoLevel>(2);
  const [matchLevel, setMatchLevel] = useState<GoLevel>(2);
  const [human, setHuman] = useState<Player>(BLACK);
  const [handicap, setHandicap] = useState(0);
  const [history, setHistory] = useState<GoState[]>(() => [newGame(9)]);
  const [komi, setKomi] = useState(7.5);
  const [phase, setPhase] = useState<Phase>('play');
  const [dead, setDead] = useState<Set<number>>(() => new Set());
  const [estimating, setEstimating] = useState(false);
  const [result, setResult] = useState('');
  const [message, setMessage] = useState('');
  const [focus, setFocus] = useState(40);
  const [announce, setAnnounce] = useState('');
  const [problemState, setProblemState] = useState<
    'solving' | 'solved' | 'failed'
  >('solving');
  const [showExplain, setShowExplain] = useState(false);
  /** Why the last wrong move fails (shown with the refutation on the board). */
  const [refuted, setRefuted] = useState('');
  /** 形势判断 toggle and the judgment for the position it was computed on. */
  const [judgeOn, setJudgeOn] = useState(false);
  const [judgment, setJudgment] = useState<{
    state: GoState;
    j: GoJudgment | null;
  } | null>(null);
  const autoResign = useSyncExternalStore(
    subscribeAutoResign,
    readAutoResign,
    () => true,
  );
  /** Black winrate after each AI move, keyed by move number (undo-safe). */
  const [trend, setTrend] = useState<{ n: number; w: number }[]>([]);
  const boardRef = useRef<HTMLFieldSetElement>(null);
  const aiRef = useRef(ai);
  useEffect(() => {
    aiRef.current = ai;
  });

  const state = history[history.length - 1];
  const n = state.size;
  const problem = mode.kind === 'problem' ? GO_PROBLEMS[mode.index] : null;
  const su: ProblemSetup | null = useMemo(
    () => (problem ? setup(problem) : null),
    [problem],
  );
  const correctKeys = useMemo(() => (su ? correctMoves(su) : []), [su]);
  const aiToMove =
    mode.kind === 'game' && phase === 'play' && state.toPlay !== human;
  const gameKey = `${n}-${matchLevel}`;

  function startScoring() {
    setPhase('scoring');
    setEstimating(true);
    setMessage('双方虚手，进入数子。正在估计死子……');
  }

  useEffect(() => {
    if (phase !== 'scoring') return;
    let cancelled = false;
    const request = aiRef.current.dead(state);
    void request.promise.then((d) => {
      if (cancelled) return;
      setDead(new Set(d ?? []));
      setEstimating(false);
      setMessage(
        d
          ? '已自动标记可能的死子（淡化显示）。点一块棋切换死/活，确认后结算。'
          : '死子估计暂不可用。请点棋块手动标记死子，再确认结算。',
      );
    });
    return () => {
      cancelled = true;
      request.cancel();
    };
  }, [phase, state]);

  /** Settings as shown on screen. A choice made before hydration finishes
   *  never reaches React state (the select keeps showing it while the match
   *  silently started at the default 入门), so read the controls themselves. */
  const sizeSel = useRef<HTMLSelectElement>(null);
  const levelSel = useRef<HTMLSelectElement>(null);
  const handicapSel = useRef<HTMLSelectElement>(null);
  function shownSettings() {
    const num = (el: HTMLSelectElement | null, fallback: number) => {
      const v = Number(el?.value);
      return el && el.value !== '' && Number.isFinite(v) ? v : fallback;
    };
    const sz = num(sizeSel.current, size) as GoSize;
    const lv = num(levelSel.current, level) as GoLevel;
    return {
      sz: GO_SIZES.includes(sz) ? sz : size,
      lv: lv in GO_LEVELS ? lv : level,
      hc: num(handicapSel.current, handicap),
    };
  }

  function newMatch(as: Player = human) {
    ai.reset();
    const shown = shownSettings();
    const sz = shown.sz;
    const hc = Math.min(shown.hc, sz === 9 ? 5 : 9);
    const g = newGame(sz, hc);
    setSize(sz);
    setLevel(shown.lv);
    setHandicap(hc);
    setMatchLevel(shown.lv);
    setTrend([]);
    setJudgment(null);
    setProblemState('solving');
    setShowExplain(false);
    setRefuted('');
    setMode({ kind: 'game' });
    setHistory([g]);
    setHuman(as);
    setKomi(komiFor(hc));
    setPhase('play');
    setDead(new Set());
    setResult('');
    setMessage(
      hc >= 2
        ? `让 ${hc} 子，贴 ${komiFor(hc)} 目，白先走。`
        : `贴 ${komiFor(hc)} 目，黑先走。`,
    );
    setFocus(Math.floor((sz * sz) / 2));
    setAnnounce(
      `新对局：${sz} 路，你执${NAME[as]}，${GO_LEVELS[shown.lv].name}`,
    );
  }
  function openProblem(i: number) {
    ai.reset();
    const p = GO_PROBLEMS[i];
    const s = setup(p);
    setMode({ kind: 'problem', index: i });
    setHistory([s.state]);
    setPhase('play');
    setDead(new Set());
    setResult('');
    setProblemState('solving');
    setShowExplain(false);
    setRefuted('');
    setMessage(
      `${p.koGoal ? '黑先造劫' : p.kind === 'live' ? '黑先活' : p.kind === 'kill' ? '黑先杀' : '黑先吃'}。${p.note}（只在标出的区域落子）`,
    );
    setFocus(s.region[0] ?? 0);
    setAnnounce(`死活题：${p.name}`);
  }

  function humanPlay(p: number) {
    if (phase === 'scoring') {
      if (!estimating && state.board[p] !== EMPTY)
        setDead(toggleDead(state, dead, p));
      return;
    }
    if (phase !== 'play') return;
    if (problem && su) return problemPlay(p, su);
    if (state.toPlay !== human) return;
    const r = play(state, p);
    if (!r.ok) {
      setMessage(r.reason);
      setAnnounce(r.reason);
      return;
    }
    setMessage(r.captured.length ? `提掉 ${r.captured.length} 子` : '');
    setHistory([...history, r.state]);
    setAnnounce(
      `你下 ${coordName(n, p)}${r.captured.length ? `，提 ${r.captured.length} 子` : ''}`,
    );
  }

  function problemPlay(p: number, s: ProblemSetup) {
    if (problemState !== 'solving' || state.toPlay !== BLACK) return;
    if (p >= 0 && !s.region.includes(p)) {
      setMessage('这道题只在标出的区域里下。');
      return;
    }
    if (p < 0 && !problem!.passOk) {
      setMessage('这道题需要落子，虚手的话白棋会抢先占到要点。');
      return;
    }
    const r = play(state, p);
    if (!r.ok) {
      setMessage(r.reason);
      return;
    }
    const plies = state.moves.length;
    const depth = s.depth - plies - 1;
    const good =
      plies === 0
        ? correctKeys.includes(p)
        : playerWinning(s, r.state, Math.max(1, depth));
    const reply = whiteReply(
      s,
      r.state,
      Math.max(1, depth),
      lineMove(plies + 1),
    );
    if (!good) {
      // A verified refutation for this first move, if the problem has one.
      const w =
        plies === 0
          ? problem!.wrong?.find((x) => x.at[1] * n + x.at[0] === p)
          : undefined;
      const answer = w ? w.line[0][1] * n + w.line[0][0] : reply;
      const after = play(r.state, answer);
      setHistory([...history, r.state, ...(after.ok ? [after.state] : [])]);
      setProblemState('failed');
      setRefuted(
        w?.why ??
          `白 ${coordName(n, answer)} 应对后，${problem!.kind === 'live' ? '黑棋活不了' : '白棋就安全了'}。`,
      );
      setMessage('不对。点「悔棋」或「重来」再试，也可以看解析。');
      setAnnounce('答错了');
      return;
    }
    const captured = r.state.board[s.target] === EMPTY;
    if (captured || problem!.kind === 'live') {
      setHistory([...history, r.state]);
      setProblemState('solved');
      setShowExplain(true);
      setMessage(
        problem!.koGoal
          ? '形成劫争！能否做活还要看劫材与后续应对。'
          : problem!.kind === 'live'
            ? '活了！在本题限定区域内可以保住黑棋。'
            : '提掉了！正解。',
      );
      saveRecords(recordProblem(records, problem!.id));
      setAnnounce('答对了');
      return;
    }
    const after = play(r.state, reply);
    setHistory([...history, r.state, ...(after.ok ? [after.state] : [])]);
    setMessage(`好棋！白 ${coordName(n, reply)}，继续。`);
  }
  function lineMove(ply: number) {
    const m = problem?.line[ply];
    if (!m) return undefined;
    return m[0] < 0 ? -1 : m[1] * n + m[0];
  }

  function hint() {
    if (!problem || !su) return;
    const options = correctMoves(
      { ...su, depth: Math.max(2, su.depth - state.moves.length) },
      state,
    );
    const preferred = lineMove(state.moves.length);
    const m =
      preferred !== undefined && options.includes(preferred)
        ? preferred
        : options[0];
    if (m === undefined) return;
    if (m < 0) {
      setMessage('提示：这时候最好的应对是不动——点「虚手」。');
      return;
    }
    setFocus(m);
    boardRef.current
      ?.querySelector<HTMLButtonElement>(`[data-pt="${m}"]`)
      ?.focus();
    setMessage(`提示：试试 ${coordName(n, m)}。`);
  }

  function undo() {
    if (history.length < 2 || phase === 'over') return;
    ai.reset();
    let k = history.length - 1;
    // Undo the opponent's reply as well, including in problem mode.
    const player = mode.kind === 'game' ? human : BLACK;
    while (k > 1 && history[k - 1].toPlay !== player) k--;
    setHistory(history.slice(0, k));
    setPhase('play');
    setDead(new Set());
    setResult('');
    setProblemState('solving');
    setRefuted('');
    setMessage('');
  }

  function humanPass() {
    if (problem && su) return problemPlay(-1, su);
    if (phase !== 'play' || mode.kind !== 'game' || state.toPlay !== human)
      return;
    const r = play(state, -1);
    if (!r.ok) return;
    setHistory([...history, r.state]);
    setAnnounce('你虚手');
    if (r.state.passes >= 2) startScoring();
  }
  function resign() {
    if (phase !== 'play' || mode.kind !== 'game') return;
    ai.reset();
    setPhase('over');
    setResult(`你认输了，${NAME[other(human)]}方胜。`);
    saveRecords(recordGoGame(records, gameKey, false));
  }
  function confirmScore() {
    if (phase !== 'scoring' || estimating) return;
    ai.reset();
    const sc = score(state, komi, dead);
    const won = sc.winner === human;
    setPhase('over');
    setResult(
      `黑 ${sc.black} 子 ： 白 ${sc.white - komi} 子 + 贴 ${komi} = ${sc.white}。${NAME[sc.winner]}胜 ${sc.margin} 子${won ? '，你赢了！' : '。'}`,
    );
    saveRecords(recordGoGame(records, gameKey, won));
  }

  // Bind each request to this position. Restarting at the same move count must
  // cancel the previous worker as well as ignore its eventual response.
  const latest = useRef({
    state,
    komi,
    level: matchLevel,
    records,
    gameKey,
    startScoring,
    saveRecords,
    trend,
    autoResign,
  });
  useEffect(() => {
    latest.current = {
      state,
      komi,
      level: matchLevel,
      records,
      gameKey,
      startScoring,
      saveRecords,
      trend,
      autoResign,
    };
  });
  useEffect(() => {
    if (!aiToMove) return;
    let cancelled = false;
    const l = latest.current;
    const request = aiRef.current.move(l.state, l.komi, l.level);
    void request.promise.then((r) => {
      if (cancelled) return;
      if (!r) {
        setMessage('AI 暂不可用，请重新开局。');
        return;
      }
      const now = latest.current;
      if (r.fallback) setMatchLevel(1);
      const aiColor = l.state.toPlay;
      const moveNo = l.state.moves.length + 1;
      const earlier = now.trend
        .filter((t) => t.n < moveNo && t.n % 2 === moveNo % 2)
        .map((t) => (aiColor === BLACK ? t.w : 1 - t.w));
      // Same estimator as 形势判断: winrate and lead share one playout sample.
      const deficit = aiColor === BLACK ? -r.lead : r.lead;
      if (
        shouldResign({
          winrates: [...earlier, r.winrate],
          deficit,
          moveCount: l.state.moves.length,
          size: l.state.size,
          level: r.fallback ? 1 : l.level,
          enabled: now.autoResign,
        })
      ) {
        aiRef.current.reset();
        setPhase('over');
        const text = `AI 认输：估计胜率 ${Math.round(r.winrate * 100)}%，落后约 ${deficit} 目（已计贴目）。你赢了！`;
        setResult(text);
        now.saveRecords(recordGoGame(now.records, now.gameKey, true));
        setAnnounce(text);
        return;
      }
      const res = play(l.state, r.move);
      if (!res.ok) return;
      const blackW = r.blackWinrate;
      setTrend((t) => [
        ...t.filter((x) => x.n < moveNo),
        { n: moveNo, w: blackW },
      ]);
      setHistory((h) => [...h, res.state]);
      setAnnounce(
        `AI 下 ${coordName(res.state.size, r.move)}，胜率估计 ${Math.round(r.winrate * 100)}%`,
      );
      if (res.state.passes >= 2) now.startScoring();
    });
    return () => {
      cancelled = true;
      request.cancel();
    };
  }, [aiToMove, state]);

  // 形势判断 runs in its own worker, only while it is the human's turn so it
  // never competes with the AI's search.
  const judging = judgeOn && !problem && phase === 'play' && !aiToMove;
  useEffect(() => {
    if (!judging) return;
    let cancelled = false;
    const l = latest.current;
    const request = aiRef.current.judge(l.state, l.komi);
    void request.promise.then((j) => {
      if (!cancelled) setJudgment({ state: l.state, j });
    });
    return () => {
      cancelled = true;
      request.cancel();
    };
  }, [judging, state]);
  const currentJudgment =
    !problem && phase === 'play' && judgment?.state === state ? judgment : null;
  const judged = judgeOn ? currentJudgment?.j : null;
  const judgeSummary = judged ? summarize(judged) : '';
  const shownTrend = trend.filter((t) => t.n <= state.moves.length);

  const live =
    phase === 'scoring' || phase === 'over' ? score(state, komi, dead) : null;
  const last = state.moves[state.moves.length - 1];
  const stars = starPoints(n);
  const regionSet = new Set(su?.region ?? []);

  function onKey(e: KeyboardEvent<HTMLButtonElement>, p: number) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const d: Record<string, number> = {
      ArrowUp: -n,
      ArrowDown: n,
      ArrowLeft: -1,
      ArrowRight: 1,
    };
    const step = d[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const x = p % n;
    if (
      (e.key === 'ArrowLeft' && x === 0) ||
      (e.key === 'ArrowRight' && x === n - 1)
    )
      return;
    const q = p + step;
    if (q < 0 || q >= n * n) return;
    setFocus(q);
    boardRef.current
      ?.querySelector<HTMLButtonElement>(`[data-pt="${q}"]`)
      ?.focus();
  }

  const stats = records.games[gameKey];
  const status =
    result ||
    (problem
      ? problemState === 'solved'
        ? '已解出'
        : problemState === 'failed'
          ? '答错了'
          : '黑先'
      : phase === 'scoring'
        ? '数子中'
        : aiToMove
          ? 'AI 思考中…'
          : `轮到你（${NAME[state.toPlay]}）`);

  return (
    <div className="kit go">
      <header className="kit-head">
        <div>
          <p className="kit-kicker">
            GO ·{' '}
            {problem
              ? `死活题 · ${problem.name}`
              : `${n} 路 · ${GO_LEVELS[matchLevel].name} · 执${NAME[human]}`}
          </p>
          <h2>围棋</h2>
        </div>
        <select
          aria-label="模式"
          value={mode.kind === 'problem' ? mode.index : ''}
          onChange={(e) =>
            e.target.value === ''
              ? newMatch()
              : openProblem(Number(e.target.value))
          }
        >
          <option value="">对局模式</option>
          {GO_PROBLEMS.map((p, i) => (
            <option key={p.id} value={i}>
              死活题：{p.name}
              {records.problems.includes(p.id) ? ' ✓' : ''}
            </option>
          ))}
        </select>
      </header>
      {!problem && (
        <div className="kit-row">
          <select
            ref={sizeSel}
            aria-label="棋盘"
            value={size}
            onChange={(e) => {
              const value = Number(e.target.value) as GoSize;
              setSize(value);
              if (value === 9) setHandicap((h) => Math.min(h, 5));
            }}
          >
            {GO_SIZES.map((s) => (
              <option key={s} value={s}>
                {s} 路
              </option>
            ))}
          </select>
          <select
            ref={levelSel}
            aria-label="难度（下局生效）"
            value={level}
            onChange={(e) => setLevel(Number(e.target.value) as GoLevel)}
          >
            {(Object.keys(GO_LEVELS) as unknown as GoLevel[]).map((l) => (
              <option key={l} value={l}>
                {GO_LEVELS[l].name}（{GO_LEVELS[l].note}）
              </option>
            ))}
          </select>
          <select
            ref={handicapSel}
            aria-label="让子"
            value={handicap}
            onChange={(e) => setHandicap(Number(e.target.value))}
          >
            <option value={0}>不让子</option>
            {[2, 3, 4, 5, 6, 7, 8, 9]
              .filter((k) => size > 9 || k <= 5)
              .map((k) => (
                <option key={k} value={k}>
                  让 {k} 子（黑）
                </option>
              ))}
          </select>
          <button
            type="button"
            className="kit-primary"
            onClick={() => newMatch(BLACK)}
          >
            执黑开局
          </button>
          <button type="button" onClick={() => newMatch(WHITE)}>
            执白开局
          </button>
        </div>
      )}
      <div className="kit-row">
        <span className="kit-stats">
          <output
            className={
              problemState === 'solved' || result.includes('你赢')
                ? 'kit-ok'
                : undefined
            }
          >
            {status}
          </output>
          {!problem && (
            <span>
              提子 黑 {state.captures[BLACK]} · 白 {state.captures[WHITE]} · 贴{' '}
              {komi}
            </span>
          )}
          {!problem && stats && (
            <span>
              本档 {stats.won} 胜 / {stats.played} 局
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={undo}
          disabled={history.length < 2 || aiToMove || phase === 'over'}
        >
          <Undo2 size={15} aria-hidden="true" /> 悔棋
        </button>
        {problem ? (
          <>
            <button
              type="button"
              onClick={hint}
              disabled={problemState !== 'solving'}
            >
              <Lightbulb size={15} aria-hidden="true" /> 提示
            </button>
            <button
              type="button"
              onClick={humanPass}
              disabled={problemState !== 'solving'}
            >
              <Hand size={15} aria-hidden="true" /> 虚手
            </button>
            <button
              type="button"
              aria-expanded={showExplain}
              onClick={() => setShowExplain(!showExplain)}
            >
              <BookOpen size={15} aria-hidden="true" /> 解析
            </button>
            <button
              type="button"
              onClick={() =>
                openProblem(mode.kind === 'problem' ? mode.index : 0)
              }
            >
              <RotateCcw size={15} aria-hidden="true" /> 重来
            </button>
          </>
        ) : phase === 'scoring' ? (
          <button
            type="button"
            className="kit-primary"
            onClick={confirmScore}
            disabled={estimating}
          >
            确认结算
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={humanPass}
              disabled={phase !== 'play' || aiToMove}
            >
              <Hand size={15} aria-hidden="true" /> 虚手
            </button>
            <button type="button" onClick={resign} disabled={phase !== 'play'}>
              <Flag size={15} aria-hidden="true" /> 认输
            </button>
            <button
              type="button"
              aria-pressed={judgeOn}
              onClick={() => {
                if (!judgeOn) setJudgment(null);
                setJudgeOn(!judgeOn);
              }}
            >
              <Gauge size={15} aria-hidden="true" /> 形势判断
            </button>
            <label className="go-check">
              <input
                type="checkbox"
                checked={autoResign}
                onChange={(e) => saveAutoResign(e.target.checked)}
              />
              AI 自动认输
            </label>
          </>
        )}
      </div>
      {message && <p className="kit-brief">{message}</p>}
      {refuted && (
        <output className="go-refute">
          <strong>为什么不行：</strong>
          {refuted}
        </output>
      )}
      {problem && showExplain && (
        <div className="go-explain">
          <p>
            <strong>解析：</strong>
            {problem.explain}
          </p>
          {problem.line.length > 0 && (
            <p>
              主线：
              {problem.line
                .map(
                  ([x, y], i) =>
                    `${i % 2 ? '白' : '黑'}${x < 0 ? '虚手' : coordName(n, y * n + x)}`,
                )
                .join('、')}
              {correctKeys.length > 1 &&
                `（同样正确的首手：${correctKeys
                  .filter((k) => k !== lineMove(0))
                  .map((k) => (k < 0 ? '虚手' : coordName(n, k)))
                  .join('、')}）`}
            </p>
          )}
        </div>
      )}
      {ai.compatibility && (
        <p className="kit-help">
          后台计算暂不可用，已切换入门强度兼容计算；数子时请手工标记死子。
        </p>
      )}
      {judgeOn && !problem && (
        <div className="go-judge">
          <output aria-live="polite">
            {judged
              ? judgeSummary
              : phase !== 'play'
                ? '形势判断只在对局进行中更新。'
                : aiToMove
                  ? '等 AI 落子后再判断…'
                  : currentJudgment?.j === null
                    ? '形势判断暂不可用，关闭后重新打开可重试。'
                    : '形势判断计算中…'}
          </output>
          {shownTrend.length >= 2 && <Trend points={shownTrend} />}
        </div>
      )}
      {live && (
        <p className="kit-help">
          当前数子：黑 {live.black} · 白 {live.white}（含贴目 {komi}）
        </p>
      )}
      <fieldset
        ref={boardRef}
        className={`go-board${phase === 'scoring' ? ' is-scoring' : ''}${judgeOn ? ' is-judging' : ''}`}
        style={{ ['--n' as string]: n }}
        aria-label={`${n} 路棋盘。方向键移动，回车落子。`}
      >
        {Array.from({ length: n * n }, (_, p) => {
          const x = p % n;
          const y = Math.floor(p / n);
          const c = state.board[p];
          const owner = live?.territory[p] ?? 0;
          const cls = [
            'go-pt',
            x === 0 && 'is-l',
            x === n - 1 && 'is-r',
            y === 0 && 'is-t',
            y === n - 1 && 'is-b',
            stars.has(p) && 'is-star',
            regionSet.has(p) && c === EMPTY && 'is-region',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={p}
              type="button"
              data-pt={p}
              className={cls}
              tabIndex={focus === p ? 0 : -1}
              aria-label={`${coordName(n, p)}${c === BLACK ? ' 黑子' : c === WHITE ? ' 白子' : ''}${dead.has(p) ? '（死）' : ''}${last === p ? '，上一手' : ''}`}
              onClick={() => humanPlay(p)}
              onKeyDown={(e) => onKey(e, p)}
              onFocus={() => setFocus(p)}
            >
              {c !== EMPTY && (
                <span
                  className={`go-stone ${c === BLACK ? 'is-black' : 'is-white'}${dead.has(p) ? ' is-dead' : ''}${last === p ? ' is-last' : ''}`}
                  aria-hidden="true"
                />
              )}
              {live && c === EMPTY && owner !== 0 && (
                <span
                  className={`go-terr ${owner === BLACK ? 'is-black' : 'is-white'}`}
                  aria-hidden="true"
                />
              )}
              {live && dead.has(p) && (
                <span
                  className={`go-terr ${c === BLACK ? 'is-white' : 'is-black'}`}
                  aria-hidden="true"
                />
              )}
              {currentJudgment?.j &&
                Math.abs(currentJudgment.j.ownership[p]) >= 0.2 &&
                (c === EMPTY ||
                  (c === BLACK) !== currentJudgment.j.ownership[p] > 0) && (
                  <span
                    className={`go-own ${currentJudgment.j.ownership[p] > 0 ? 'is-black' : 'is-white'}`}
                    style={{
                      ['--a' as string]: Math.abs(
                        currentJudgment.j.ownership[p],
                      ).toFixed(2),
                    }}
                    aria-hidden="true"
                  />
                )}
            </button>
          );
        })}
      </fieldset>
      <p className="kit-help">
        棋盘、难度和让子在重新开局后生效。点交叉点落子；键盘用方向键移动、回车落子。中国规则数子（子
        + 围住的空），提子、禁止自杀、劫（不能立即提回）。
        双方连续虚手后进入数子：AI 先估计死子，你可以点棋块修改再确认。AI
        用蒙特卡洛树搜索（RAVE + 3×3 棋形模拟 +
        搜索树复用）在后台线程思考，共十档；9 路最强，13/19 路明显变弱。
        「形势判断」显示胜率、目差估计和归属图（方块越实越确定）；AI
        在大势已去时会认输（入门档不认输，可关闭）。
      </p>
      <p className="kit-sr" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}

function starPoints(n: number) {
  const e = n >= 13 ? 3 : 2;
  const mid = (n - 1) >> 1;
  const xs = n >= 13 ? [e, mid, n - 1 - e] : [e, n - 1 - e];
  const s = new Set<number>();
  for (const x of xs) for (const y of xs) s.add(y * n + x);
  if (n === 9) s.add(mid * n + mid);
  return s;
}

function summarize(j: GoJudgment) {
  let b = 0;
  let w = 0;
  for (const o of j.ownership) {
    if (o >= 0.5) b++;
    else if (o <= -0.5) w++;
  }
  const lead =
    Math.abs(j.lead) < 0.5
      ? '双方接近'
      : `${j.lead > 0 ? '黑' : '白'}约领先 ${Math.abs(j.lead)} 目`;
  return `形势判断：黑胜率 ${Math.round(j.blackWinrate * 100)}%，${lead}（已计贴目）。较确定的归属：黑 ${b} 点 · 白 ${w} 点。`;
}

function Trend({ points }: { points: { n: number; w: number }[] }) {
  const W = 120;
  const H = 28;
  const pts = points
    .map(
      (p, i) =>
        `${((i / (points.length - 1)) * W).toFixed(1)},${((1 - p.w) * H).toFixed(1)}`,
    )
    .join(' ');
  const lastW = points[points.length - 1].w;
  return (
    <svg
      className="go-trend"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      // SVG charts need an image role so their accessible name is announced.
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="img"
      aria-label={`黑胜率走势（AI 每手后估计）：最近 ${Math.round(lastW * 100)}%`}
    >
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="go-trend-mid" />
      <polyline points={pts} fill="none" />
    </svg>
  );
}
