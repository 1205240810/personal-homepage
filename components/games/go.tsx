'use client';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Flag, Hand, Lightbulb, RotateCcw, Undo2 } from 'lucide-react';
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
  guessDead,
  type GoAiResult,
  type GoLevel,
} from '@/lib/games/go-ai';
import {
  GO_PROBLEMS,
  playerWinning,
  setup,
  whiteReply,
  type ProblemSetup,
} from '@/lib/games/go-problems';
import { useLocalRecords } from './kit';
import goWorkerUrl from './go-worker.ts?worker&url';
import './kit.css';
import './go.css';

const EMPTY_RECORDS = emptyGoRecords();
const NAME: Record<Player, string> = { 1: '黑', 2: '白' };
const wire = (s: GoState) => ({ ...s, board: Array.from(s.board) });

function useGoAi() {
  const worker = useRef<Worker | null>(null);
  const waiting = useRef(new Map<number, (r: unknown) => void>());
  const seq = useRef(0);
  useEffect(() => {
    if (typeof Worker === 'undefined') return;
    let w: Worker;
    try {
      w = new Worker(goWorkerUrl, { type: 'module' });
    } catch {
      return;
    }
    const pending = waiting.current;
    w.onmessage = (e: MessageEvent<{ id: number; result?: unknown }>) => {
      pending.get(e.data.id)?.(e.data.result ?? null);
      pending.delete(e.data.id);
    };
    worker.current = w;
    return () => {
      w.terminate();
      worker.current = null;
      pending.clear();
    };
  }, []);
  function send<T>(msg: object, fallback: () => T) {
    return new Promise<T>((resolve) => {
      const id = ++seq.current;
      if (worker.current) {
        waiting.current.set(id, resolve as (r: unknown) => void);
        worker.current.postMessage({ id, ...msg });
      } else setTimeout(() => resolve(fallback()), 0);
    });
  }
  return {
    move: (s: GoState, komi: number, level: GoLevel) =>
      send<GoAiResult>({ type: 'move', state: wire(s), komi, level }, () =>
        chooseGoMove(s, komi, level),
      ),
    dead: (s: GoState) =>
      send<number[]>({ type: 'dead', state: wire(s) }, () => guessDead(s, 150)),
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
  const [human, setHuman] = useState<Player>(BLACK);
  const [handicap, setHandicap] = useState(0);
  const [history, setHistory] = useState<GoState[]>(() => [newGame(9)]);
  const [komi, setKomi] = useState(7.5);
  const [phase, setPhase] = useState<Phase>('play');
  const [dead, setDead] = useState<Set<number>>(() => new Set());
  const [result, setResult] = useState('');
  const [message, setMessage] = useState('');
  const [focus, setFocus] = useState(40);
  const [announce, setAnnounce] = useState('');
  const [problemState, setProblemState] = useState<
    'solving' | 'solved' | 'failed'
  >('solving');
  const boardRef = useRef<HTMLFieldSetElement>(null);
  const aiRef = useRef(ai);
  useEffect(() => {
    aiRef.current = ai;
  });

  const state = history[history.length - 1];
  const n = state.size;
  const problem = mode.kind === 'problem' ? GO_PROBLEMS[mode.index] : null;
  const su: ProblemSetup | null = problem ? setup(problem) : null;
  const aiToMove =
    mode.kind === 'game' && phase === 'play' && state.toPlay !== human;
  const gameKey = `${n}-${level}`;

  function startScoring(s: GoState) {
    setPhase('scoring');
    setMessage('双方虚手，进入数子。正在估计死子……点任意一块棋可切换死/活。');
    void aiRef.current.dead(s).then((d) => {
      setDead(new Set(d ?? []));
      setMessage(
        '已自动标记可能的死子（打叉）。点一块棋切换死/活，确认后结算。',
      );
    });
  }

  function newMatch(as: Player = human, sz: GoSize = size, hc = handicap) {
    const g = newGame(sz, hc);
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
    setAnnounce(`新对局：${sz} 路，你执${NAME[as]}，${GO_LEVELS[level].name}`);
  }
  function openProblem(i: number) {
    const p = GO_PROBLEMS[i];
    const s = setup(p);
    setMode({ kind: 'problem', index: i });
    setHistory([s.state]);
    setPhase('play');
    setDead(new Set());
    setResult('');
    setProblemState('solving');
    setMessage(
      `${p.kind === 'live' ? '黑先活' : p.kind === 'kill' ? '黑先杀' : '黑先吃'}。${p.note}（只在标出的区域落子）`,
    );
    setFocus(s.region[0] ?? 0);
    setAnnounce(`死活题：${p.name}`);
  }

  function humanPlay(p: number) {
    if (phase === 'scoring') {
      if (state.board[p] !== EMPTY) setDead(toggleDead(state, dead, p));
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
    const r = play(state, p);
    if (!r.ok) {
      setMessage(r.reason);
      return;
    }
    const plies = state.moves.length;
    const depth = s.depth - plies - 1;
    const good = playerWinning(s, r.state, Math.max(1, depth));
    const reply = whiteReply(
      s,
      r.state,
      Math.max(1, depth),
      lineMove(plies + 1),
    );
    if (!good) {
      const after = play(r.state, reply);
      setHistory([...history, r.state, ...(after.ok ? [after.state] : [])]);
      setProblemState('failed');
      setMessage(
        `不对。白 ${coordName(n, reply)} 应对后，${problem!.kind === 'live' ? '黑棋活不了' : '白棋就安全了'}。点「重来」再试。`,
      );
      setAnnounce('答错了');
      return;
    }
    const captured = r.state.board[s.target] === EMPTY;
    if (captured || problem!.kind === 'live') {
      setHistory([...history, r.state]);
      setProblemState('solved');
      setMessage(
        problem!.kind === 'live'
          ? '活了！白怎么下都吃不掉。'
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
    if (!problem) return;
    const m = lineMove(state.moves.length);
    if (m === undefined || m < 0) return;
    setFocus(m);
    boardRef.current
      ?.querySelector<HTMLButtonElement>(`[data-pt="${m}"]`)
      ?.focus();
    setMessage(`提示：试试 ${coordName(n, m)}。`);
  }

  function undo() {
    if (history.length < 2) return;
    let k = history.length - 1;
    if (mode.kind === 'game')
      // Back to the latest earlier position where it is the human's turn.
      while (k > 1 && history[k - 1].toPlay !== human) k--;
    setHistory(history.slice(0, k));
    setPhase('play');
    setDead(new Set());
    setResult('');
    setProblemState('solving');
    setMessage('');
  }

  function humanPass() {
    if (phase !== 'play' || mode.kind !== 'game' || state.toPlay !== human)
      return;
    const r = play(state, -1);
    if (!r.ok) return;
    setHistory([...history, r.state]);
    setAnnounce('你虚手');
    if (r.state.passes >= 2) startScoring(r.state);
  }
  function resign() {
    if (phase !== 'play' || mode.kind !== 'game') return;
    setPhase('over');
    setResult(`你认输了，${NAME[other(human)]}方胜。`);
    saveRecords(recordGoGame(records, gameKey, false));
  }
  function confirmScore() {
    const sc = score(state, komi, dead);
    const won = sc.winner === human;
    setPhase('over');
    setResult(
      `黑 ${sc.black} 子 ： 白 ${sc.white - komi} 子 + 贴 ${komi} = ${sc.white}。${NAME[sc.winner]}胜 ${sc.margin} 子${won ? '，你赢了！' : '。'}`,
    );
    saveRecords(recordGoGame(records, gameKey, won));
  }

  // AI move (runs in the worker). Latest values are read through a ref so the
  // effect only re-runs when it becomes the AI's turn or a move is added.
  const moveCount = state.moves.length;
  const latest = useRef({
    state,
    komi,
    level,
    records,
    gameKey,
    startScoring,
    saveRecords,
  });
  useEffect(() => {
    latest.current = {
      state,
      komi,
      level,
      records,
      gameKey,
      startScoring,
      saveRecords,
    };
  });
  useEffect(() => {
    if (!aiToMove) return;
    let cancelled = false;
    const l = latest.current;
    void aiRef.current.move(l.state, l.komi, l.level).then((r) => {
      if (cancelled || !r) return;
      const now = latest.current;
      if (r.move === -2) {
        setPhase('over');
        setResult('AI 认输，你赢了！');
        now.saveRecords(recordGoGame(now.records, now.gameKey, true));
        setAnnounce('AI 认输');
        return;
      }
      const res = play(now.state, r.move);
      if (!res.ok) return;
      setHistory((h) => [...h, res.state]);
      setAnnounce(
        `AI 下 ${coordName(res.state.size, r.move)}，胜率估计 ${Math.round(r.winrate * 100)}%`,
      );
      if (res.state.passes >= 2) now.startScoring(res.state);
    });
    return () => {
      cancelled = true;
    };
  }, [aiToMove, moveCount]);

  const live =
    phase === 'scoring' || phase === 'over' ? score(state, komi, dead) : null;
  const last = state.moves[state.moves.length - 1];
  const stars = starPoints(n);
  const regionSet = new Set(su?.region ?? []);

  function onKey(e: KeyboardEvent<HTMLButtonElement>, p: number) {
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
              : `${n} 路 · ${GO_LEVELS[level].name} · 执${NAME[human]}`}
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
            aria-label="棋盘"
            value={size}
            onChange={(e) => setSize(Number(e.target.value) as GoSize)}
          >
            {GO_SIZES.map((s) => (
              <option key={s} value={s}>
                {s} 路
              </option>
            ))}
          </select>
          <select
            aria-label="难度"
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
            onClick={() => newMatch(BLACK, size, handicap)}
          >
            执黑开局
          </button>
          <button type="button" onClick={() => newMatch(WHITE, size, handicap)}>
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
          disabled={history.length < 2 || aiToMove}
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
              onClick={() =>
                openProblem(mode.kind === 'problem' ? mode.index : 0)
              }
            >
              <RotateCcw size={15} aria-hidden="true" /> 重来
            </button>
          </>
        ) : phase === 'scoring' ? (
          <button type="button" className="kit-primary" onClick={confirmScore}>
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
          </>
        )}
      </div>
      {message && <p className="kit-brief">{message}</p>}
      {live && (
        <p className="kit-help">
          当前数子：黑 {live.black} · 白 {live.white}（含贴目 {komi}）
        </p>
      )}
      <fieldset
        ref={boardRef}
        className={`go-board${phase === 'scoring' ? ' is-scoring' : ''}`}
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
            </button>
          );
        })}
      </fieldset>
      <p className="kit-help">
        点交叉点落子；键盘用方向键移动、回车落子。中国规则数子（子 +
        围住的空），提子、禁止自杀、劫（不能立即提回）。
        双方连续虚手后进入数子：AI 先估计死子，你可以点棋块修改再确认。AI
        用蒙特卡洛树搜索在后台线程思考，9 路最强，13/19 路明显变弱。
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
