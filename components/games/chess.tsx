'use client';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUpDown, Flag, Lightbulb, RotateCcw, Undo2 } from 'lucide-react';
import type { Square } from 'chess.js';
import {
  CHESS_LEVELS,
  chooseMove,
  mateKeys,
  type AiResult,
  type ChessLevel,
} from '@/lib/games/chess-ai';
import {
  CHESS_PUZZLES,
  CHESS_RECORDS_KEY,
  PIECE_NAMES,
  START_FEN,
  emptyChessRecords,
  gameEnd,
  recordGame,
  recordPuzzle,
  replay,
  validateChessRecords,
  type Color,
} from '@/lib/games/chess';
import { useLocalRecords } from './kit';
// Vite provides a default URL export for the worker query.
// oxlint-disable-next-line import/default
import chessWorkerUrl from './chess-worker.ts?worker&url';
import './kit.css';
import './chess.css';

const EMPTY = emptyChessRecords();
const FILES = 'abcdefgh';
const GLYPH: Record<string, string> = {
  k: '♚',
  q: '♛',
  r: '♜',
  b: '♝',
  n: '♞',
  p: '♟',
};
const COLOR_NAME: Record<Color, string> = { w: '白', b: '黑' };

/** One search owns one worker so leaving a position also stops its CPU work. */
function askChessAi(fen: string, level: ChessLevel) {
  let worker: Worker | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finish: (result: AiResult | null) => void = () => {};
  const promise = new Promise<AiResult | null>((resolve) => {
    finish = (result) => {
      clearTimeout(timer);
      worker?.terminate();
      resolve(result);
    };
    if (typeof Worker === 'undefined') {
      // Keep this compatibility path short enough to leave the controls responsive.
      timer = setTimeout(() => {
        try {
          finish(chooseMove(fen, Math.min(level, 2) as ChessLevel));
        } catch {
          finish(null);
        }
      }, 0);
      return;
    }
    try {
      worker = new Worker(chessWorkerUrl, { type: 'module' });
      worker.onmessage = (e: MessageEvent<{ result?: AiResult | null }>) =>
        finish(e.data.result ?? null);
      worker.onerror = (event) => {
        event.preventDefault();
        finish(null);
      };
      worker.onmessageerror = () => finish(null);
      timer = setTimeout(() => finish(null), CHESS_LEVELS[level].timeMs + 5000);
      worker.postMessage({ id: 1, fen, level });
    } catch {
      finish(null);
    }
  });
  return { promise, cancel: () => finish(null) };
}

type Mode = { kind: 'game' } | { kind: 'puzzle'; index: number };

export function ChessGame() {
  const [records, saveRecords] = useLocalRecords(
    CHESS_RECORDS_KEY,
    validateChessRecords,
    EMPTY,
  );
  const [generation, setGeneration] = useState(0);
  const [aiError, setAiError] = useState(false);
  const [mode, setMode] = useState<Mode>({ kind: 'game' });
  const [startFen, setStartFen] = useState(START_FEN);
  const [moves, setMoves] = useState<string[]>([]);
  const [player, setPlayer] = useState<Color>('w');
  const [level, setLevel] = useState<ChessLevel>(2);
  const [flipped, setFlipped] = useState(false);
  const [selected, setSelected] = useState<Square | null>(null);
  const [focus, setFocus] = useState<Square>('e2');
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null);
  const [message, setMessage] = useState('');
  const [announce, setAnnounce] = useState('');
  const [resigned, setResigned] = useState(false);
  const token = useRef(0);
  const counted = useRef(false);
  const boardRef = useRef<HTMLFieldSetElement>(null);

  const game = replay(startFen, moves);
  const end = gameEnd(game);
  const puzzle = mode.kind === 'puzzle' ? CHESS_PUZZLES[mode.index] : null;
  const turn = game.turn() as Color;
  const aiTurn =
    !end.over && !resigned && turn !== player && !(puzzle?.kind === 'mate');
  const thinking = aiTurn && !aiError;
  const history = game.history({ verbose: true });
  const last = history[history.length - 1];
  const puzzleSolved = !!puzzle && end.over && end.winner === player;

  const fen = game.fen();
  const aiLevel: ChessLevel = puzzle ? 4 : level;
  useEffect(() => {
    if (!aiTurn) return;
    const my = ++token.current;
    let cancelled = false;
    const request = askChessAi(fen, aiLevel);
    void request.promise.then((r) => {
      if (cancelled || token.current !== my) return;
      if (!r) {
        setAiError(true);
        return;
      }
      setMoves((m) => [...m, r.san]);
      setAnnounce(`对手走 ${r.san}`);
    });
    return () => {
      cancelled = true;
      request.cancel();
    };
  }, [aiTurn, fen, aiLevel, generation]);

  // Record finished games once.
  useEffect(() => {
    if (counted.current) return;
    if (puzzle) {
      if (puzzleSolved) {
        counted.current = true;
        saveRecords(recordPuzzle(records, puzzle.id));
      }
      return;
    }
    if (!end.over && !resigned) return;
    if (moves.length < 2) return;
    counted.current = true;
    const result = resigned
      ? 'lost'
      : !end.over || end.winner === null
        ? 'drawn'
        : end.winner === player
          ? 'won'
          : 'lost';
    saveRecords(recordGame(records, level, result));
  });

  function reset(next: Mode, fen: string, as: Color) {
    token.current++;
    counted.current = false;
    setGeneration((n) => n + 1);
    setAiError(false);
    setMode(next);
    setStartFen(fen);
    setMoves([]);
    setPlayer(as);
    setFlipped(as === 'b');
    setSelected(null);
    setPromo(null);
    setResigned(false);
    setMessage('');
  }
  function newGame(as: Color) {
    reset({ kind: 'game' }, START_FEN, as);
    setAnnounce(
      `新对局，你执${COLOR_NAME[as]}，难度 ${CHESS_LEVELS[level].name}`,
    );
  }
  function openPuzzle(i: number) {
    const p = CHESS_PUZZLES[i];
    reset({ kind: 'puzzle', index: i }, p.fen, 'w');
    setMessage(p.kind === 'mate' ? `白先，${p.n} 步杀。${p.note}` : p.note);
    setAnnounce(`残局：${p.name}`);
  }

  function tryMove(from: Square, to: Square, promotion?: string) {
    if (end.over || resigned || turn !== player || thinking) return false;
    const c = replay(startFen, moves);
    let mv;
    try {
      mv = c.move({ from, to, promotion });
    } catch {
      return false;
    }
    if (puzzle?.kind === 'mate') {
      const ply = moves.length;
      const expected = puzzle.line[ply];
      const ok =
        mv.san === expected ||
        c.isCheckmate() ||
        (ply === 0 && puzzle.keys.includes(mv.san));
      if (!ok) {
        setMessage(`${mv.san} 不能强制将死，再想想。`);
        setAnnounce(`${mv.san} 不对`);
        setSelected(null);
        return true;
      }
      const next = [...moves, mv.san];
      if (!c.isCheckmate()) {
        // Defender's reply: the main line if it still applies, else the first legal move.
        const reply = puzzle.line[ply + 1];
        const legal = c.moves();
        const r = legal.includes(reply) ? reply : legal[0];
        next.push(r);
        setMessage(`好棋！对方应 ${r}，继续。`);
      } else setMessage('将死！');
      setMoves(next);
      setSelected(null);
      return true;
    }
    setMoves([...moves, mv.san]);
    setSelected(null);
    setMessage('');
    setAnnounce(`你走 ${mv.san}`);
    return true;
  }

  function clickSquare(sq: Square) {
    setFocus(sq);
    const piece = game.get(sq);
    if (selected) {
      if (selected === sq) {
        setSelected(null);
        return;
      }
      const options = game
        .moves({ square: selected, verbose: true })
        .filter((m) => m.to === sq);
      if (options.length) {
        if (options.some((m) => m.promotion))
          setPromo({ from: selected, to: sq });
        else tryMove(selected, sq);
        return;
      }
    }
    if (piece && piece.color === player && turn === player && !end.over) {
      setSelected(sq);
      const n = game.moves({ square: sq }).length;
      setAnnounce(`选中 ${sq} ${PIECE_NAMES[piece.type]}，${n} 种走法`);
    } else setSelected(null);
  }

  function undo() {
    token.current++;
    setAiError(false);
    setPromo(null);
    setSelected(null);
    setResigned(false);
    let n = moves.length;
    if (n === 0) return;
    // Take back to the player's turn.
    n -= 1;
    if (replay(startFen, moves.slice(0, n)).turn() !== player && n > 0) n -= 1;
    setMoves(moves.slice(0, n));
    setMessage('');
  }

  function hint() {
    if (!puzzle || puzzle.kind !== 'mate') return;
    const keys = mateKeys(fen, puzzle.n - moves.length / 2);
    const want = keys.includes(puzzle.line[moves.length])
      ? puzzle.line[moves.length]
      : keys[0];
    if (!want) return;
    const m = game.moves({ verbose: true }).find((x) => x.san === want);
    if (m) {
      setSelected(m.from);
      setMessage(`提示：动一动 ${m.from} 上的${PIECE_NAMES[m.piece]}。`);
    }
  }

  const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = flipped ? FILES.split('').reverse() : FILES.split('');
  const targets = new Set(
    selected
      ? game.moves({ square: selected, verbose: true }).map((m) => m.to)
      : [],
  );
  const checkSq =
    !end.over || end.winner
      ? game.inCheck()
        ? (game
            .board()
            .flat()
            .find((p) => p && p.type === 'k' && p.color === turn)?.square ??
          null)
        : null
      : null;

  function onBoardKey(e: KeyboardEvent<HTMLButtonElement>) {
    const d: Record<string, [number, number]> = {
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const v = d[e.key];
    if (!v) return;
    e.preventDefault();
    const s = flipped ? -1 : 1;
    const f = Math.min(7, Math.max(0, FILES.indexOf(focus[0]) + v[0] * s));
    const r = Math.min(8, Math.max(1, Number(focus[1]) + v[1] * s));
    const next = `${FILES[f]}${r}` as Square;
    setFocus(next);
    boardRef.current
      ?.querySelector<HTMLButtonElement>(`[data-sq="${next}"]`)
      ?.focus();
  }

  let status = '';
  if (resigned) status = '你认输了。';
  else if (end.over)
    status =
      end.winner === null
        ? `和棋：${end.reason}`
        : `${COLOR_NAME[end.winner]}方胜（${end.reason}）${end.winner === player ? '，恭喜！' : ''}`;
  else if (aiTurn && aiError) status = '对手暂时无法应着，请重试。';
  else if (thinking) status = '对手思考中…';
  else status = `${COLOR_NAME[turn]}方走${end.check ? '，被将军！' : ''}`;

  const pairs: [number, string, string | undefined][] = [];
  const blackFirst = replay(startFen, []).turn() === 'b';
  const sans = blackFirst ? ['…', ...moves] : moves;
  for (let i = 0; i < sans.length; i += 2)
    pairs.push([i / 2 + 1, sans[i], sans[i + 1]]);
  const stats = records.games[level];

  return (
    <div className="kit chess">
      <header className="kit-head">
        <div>
          <p className="kit-kicker">
            CHESS ·{' '}
            {puzzle
              ? `残局 · ${puzzle.name}`
              : `${CHESS_LEVELS[level].name} · 执${COLOR_NAME[player]}`}
          </p>
          <h2>国际象棋</h2>
        </div>
        <select
          aria-label="残局模式"
          value={mode.kind === 'puzzle' ? mode.index : ''}
          onChange={(e) =>
            e.target.value === ''
              ? newGame(player)
              : openPuzzle(Number(e.target.value))
          }
        >
          <option value="">对局模式</option>
          {CHESS_PUZZLES.map((p, i) => (
            <option key={p.id} value={i}>
              残局：{p.name}
              {records.puzzles.includes(p.id) ? ' ✓' : ''}
            </option>
          ))}
        </select>
      </header>
      {!puzzle && (
        <div className="kit-row">
          <select
            aria-label="难度"
            value={level}
            onChange={(e) => {
              setAiError(false);
              setLevel(Number(e.target.value) as ChessLevel);
            }}
          >
            {(Object.keys(CHESS_LEVELS) as unknown as ChessLevel[]).map((l) => (
              <option key={l} value={l}>
                {CHESS_LEVELS[l].name}：{CHESS_LEVELS[l].note}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="kit-primary"
            onClick={() => newGame('w')}
          >
            执白开局
          </button>
          <button type="button" onClick={() => newGame('b')}>
            执黑开局
          </button>
        </div>
      )}
      <div className="kit-row">
        <span className="kit-stats">
          <output
            className={end.over && end.winner === player ? 'kit-ok' : undefined}
          >
            {status}
          </output>
          {!puzzle && stats && (
            <span>
              本难度 {stats.won} 胜 {stats.drawn} 和 / {stats.played} 局
            </span>
          )}
        </span>
        {aiTurn && aiError && (
          <button
            type="button"
            onClick={() => {
              setAiError(false);
              setGeneration((n) => n + 1);
            }}
          >
            重试 AI
          </button>
        )}
        <button type="button" onClick={undo} disabled={!moves.length}>
          <Undo2 size={15} aria-hidden="true" /> 悔棋
        </button>
        <button type="button" onClick={() => setFlipped(!flipped)}>
          <ArrowUpDown size={15} aria-hidden="true" /> 翻转
        </button>
        {puzzle?.kind === 'mate' && !end.over && (
          <button type="button" onClick={hint}>
            <Lightbulb size={15} aria-hidden="true" /> 提示
          </button>
        )}
        {puzzle ? (
          <button
            type="button"
            onClick={() => openPuzzle(mode.kind === 'puzzle' ? mode.index : 0)}
          >
            <RotateCcw size={15} aria-hidden="true" /> 重来
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setResigned(true);
              token.current++;
            }}
            disabled={end.over || resigned || moves.length < 2}
          >
            <Flag size={15} aria-hidden="true" /> 认输
          </button>
        )}
      </div>
      {message && (
        <p className={puzzleSolved ? 'kit-ok' : 'kit-brief'}>{message}</p>
      )}
      <div className="chess-layout">
        <fieldset
          className="chess-board"
          ref={boardRef}
          aria-label={`棋盘，${flipped ? '黑方在下' : '白方在下'}。方向键移动焦点，回车选子和落子。`}
        >
          {ranks.map((r) => (
            <div key={r} className="chess-rank">
              {files.map((f) => {
                const sq = `${f}${r}` as Square;
                const p = game.get(sq);
                const dark = (FILES.indexOf(f) + r) % 2 === 1;
                const cls = [
                  'chess-sq',
                  dark ? 'is-dark' : 'is-light',
                  selected === sq && 'is-selected',
                  targets.has(sq) && (p ? 'is-capture' : 'is-target'),
                  last && (last.from === sq || last.to === sq) && 'is-last',
                  checkSq === sq && 'is-check',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <button
                    key={sq}
                    type="button"
                    data-sq={sq}
                    className={cls}
                    tabIndex={focus === sq ? 0 : -1}
                    aria-label={`${sq}${p ? ` ${COLOR_NAME[p.color]}${PIECE_NAMES[p.type]}` : ''}${targets.has(sq) ? '，可走' : ''}`}
                    aria-pressed={selected === sq}
                    onClick={() => clickSquare(sq)}
                    onKeyDown={onBoardKey}
                  >
                    {p && (
                      <span
                        className={`chess-piece is-${p.color}`}
                        aria-hidden="true"
                      >
                        {GLYPH[p.type]}
                      </span>
                    )}
                    {f === files[0] && (
                      <i className="chess-coord is-rank">{r}</i>
                    )}
                    {r === ranks[7] && (
                      <i className="chess-coord is-file">{f}</i>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </fieldset>
        <aside className="chess-side">
          <strong>棋谱</strong>
          <ol className="chess-moves kit-mono" aria-label="棋谱">
            {pairs.map(([n, a, b]) => (
              <li key={n}>
                <span>{n}.</span> {a} {b ?? ''}
              </li>
            ))}
          </ol>
        </aside>
      </div>
      {promo && (
        <fieldset className="chess-promo">
          <legend>升变为</legend>
          {(['q', 'r', 'b', 'n'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                tryMove(promo.from, promo.to, t);
                setPromo(null);
              }}
            >
              <span className={`chess-piece is-${player}`} aria-hidden="true">
                {GLYPH[t]}
              </span>
              {PIECE_NAMES[t]}
            </button>
          ))}
          <button type="button" onClick={() => setPromo(null)}>
            取消
          </button>
        </fieldset>
      )}
      <p className="kit-help">
        点己方棋子再点目标格走子；键盘用方向键移动焦点、回车选择。支持王车易位、吃过路兵、升变，
        以及将死、逼和、三次重复、五十回合与子力不足判和。AI
        在后台线程思考；不支持后台线程时使用初级强度。
      </p>
      <p className="kit-sr" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
