'use client';

import { Flag, Lightbulb, RotateCcw, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BLACK,
  EMPTY,
  WHITE,
  coord,
  isForbidden,
  newGame,
  play,
  resign,
  undo as undoMoves,
  type GomokuState,
  type Player,
} from '@/lib/games/gomoku';
import {
  GOMOKU_LEVELS,
  type GomokuAiResult,
  type GomokuLevel,
} from '@/lib/games/gomoku-ai';
import { GomokuBoard } from './gomoku-board';
import { useLocalRecords } from './kit';
import './kit.css';
// Vite provides the default URL export for this worker asset.
// oxlint-disable-next-line import/default
import gomokuWorkerUrl from './gomoku-worker.ts?worker&url';

const NAME = { [BLACK]: '黑', [WHITE]: '白' } as const;
const SETTINGS = 'tscjj:gomoku-settings:v1';
const RECORDS = 'tscjj:gomoku-records:v1';
type Mode = 'ai' | 'local';
type Settings = { mode: Mode; level: GomokuLevel; renju: boolean };
type Records = Partial<Record<GomokuLevel, { won: number; played: number }>>;

const DEFAULT_SETTINGS: Settings = { mode: 'ai', level: 4, renju: false };
const isLevel = (v: unknown): v is GomokuLevel =>
  typeof v === 'number' && v in GOMOKU_LEVELS;
function validateSettings(v: unknown): Settings | null {
  const o = v as Partial<Settings> | null;
  if (!o || (o.mode !== 'ai' && o.mode !== 'local') || !isLevel(o.level))
    return null;
  return { mode: o.mode, level: o.level, renju: o.renju === true };
}
function validateRecords(v: unknown): Records | null {
  if (!v || typeof v !== 'object') return null;
  const out: Records = {};
  for (const [k, r] of Object.entries(v)) {
    const lv = Number(k);
    const rec = r as { won?: unknown; played?: unknown };
    if (
      isLevel(lv) &&
      Number.isSafeInteger(rec?.won) &&
      Number.isSafeInteger(rec?.played)
    )
      out[lv] = { won: rec.won as number, played: rec.played as number };
  }
  return out;
}

function useAi() {
  const worker = useRef<Worker | null>(null);
  const seq = useRef(0);
  useEffect(() => () => worker.current?.terminate(), []);
  return (state: GomokuState, level: GomokuLevel) =>
    new Promise<GomokuAiResult>((resolve, reject) => {
      worker.current ??= new Worker(gomokuWorkerUrl, { type: 'module' });
      const id = ++seq.current;
      worker.current.onmessage = (e) => {
        if (e.data.id !== id) return;
        if (e.data.error) reject(new Error(e.data.error));
        else resolve(e.data.result);
      };
      worker.current.postMessage({ id, state, level });
    });
}

export function GomokuGame() {
  const [settings, saveSettings] = useLocalRecords(
    SETTINGS,
    validateSettings,
    DEFAULT_SETTINGS,
  );
  const [records, saveRecords] = useLocalRecords(RECORDS, validateRecords, {});
  const [human, setHuman] = useState<Player>(BLACK);
  const [started, setStarted] = useState<{
    match: Settings;
    state: GomokuState;
  } | null>(null);
  const [hint, setHint] = useState<number | null>(null);
  const ai = useAi();
  const match = started?.match ?? settings;
  const state = started?.state ?? newGame(settings.renju);

  const aiTurn =
    match.mode === 'ai' && state.winner === null && state.toPlay !== human;
  const thinking = aiTurn;

  const commit = (next: GomokuState) => {
    setStarted({ match, state: next });
    if (next.winner !== null && state.winner === null && match.mode === 'ai') {
      const cur = records[match.level] ?? { won: 0, played: 0 };
      saveRecords({
        ...records,
        [match.level]: {
          won: cur.won + (next.winner === human ? 1 : 0),
          played: cur.played + 1,
        },
      });
    }
  };

  useEffect(() => {
    if (!aiTurn) return;
    let live = true;
    const t0 = Date.now();
    void ai(state, match.level).then(async (r) => {
      // Keep a short beat so instant replies don't feel mechanical.
      const wait = 350 - (Date.now() - t0);
      if (wait > 0) await new Promise((res) => setTimeout(res, wait));
      if (live) commit(play(state, r.move));
    });
    return () => {
      live = false;
    };
  });

  const forbidden = useMemo(() => {
    if (!state.renju || state.toPlay !== BLACK || state.winner !== null)
      return new Set<number>();
    if (match.mode === 'ai' && human !== BLACK) return new Set<number>();
    const out = new Set<number>();
    state.cells.forEach((c, i) => {
      if (c === EMPTY && isForbidden(state, i)) out.add(i);
    });
    return out;
  }, [state, match.mode, human]);

  const save = (s: Settings) => saveSettings(s);
  const start = (color: Player) => {
    setHuman(color);
    setHint(null);
    setStarted({ match: settings, state: newGame(settings.renju) });
  };
  const onPlay = (i: number) => {
    if (aiTurn || state.winner !== null) return;
    setHint(null);
    commit(play(state, i));
  };
  const takeBack = () => {
    setHint(null);
    const n = match.mode === 'local' ? 1 : state.toPlay === human ? 2 : 1;
    commit(undoMoves(state, Math.min(n, state.moves.length)));
  };
  const askHint = () => {
    void ai(state, 7).then((r) => setHint(r.move));
  };

  const stats = match.mode === 'ai' ? records[match.level] : undefined;
  const last = state.moves[state.moves.length - 1];
  const status =
    state.winner !== null
      ? state.winner === 0
        ? '和棋：棋盘下满'
        : match.mode === 'ai'
          ? state.winner === human
            ? `你赢了${state.reason === 'resign' ? '（对手认输）' : ''}`
            : state.reason === 'forbidden'
              ? '黑棋落在禁手点，判负'
              : state.reason === 'resign'
                ? '你认输了'
                : 'AI 连成五子'
          : `${NAME[state.winner]}胜${state.reason === 'forbidden' ? '（黑棋禁手）' : state.reason === 'resign' ? '（认输）' : ''}`
      : thinking
        ? 'AI 思考中…'
        : match.mode === 'ai'
          ? `轮到你（${NAME[human]}）`
          : `轮到${NAME[state.toPlay]}`;

  return (
    <div className="kit gomoku">
      <header className="kit-head">
        <div>
          <p className="kit-kicker">
            GOMOKU · 15 路 · {match.renju ? '禁手规则' : '自由规则'} ·{' '}
            {match.mode === 'ai'
              ? `${GOMOKU_LEVELS[match.level].name} · 执${NAME[human]}`
              : '双人同屏'}
          </p>
          <h2 className="kit-sr">五子棋</h2>
        </div>
        <Link className="gomoku-online-link" href="/games/gomoku/online">
          和朋友联机 →
        </Link>
      </header>
      <div className="kit-row">
        <select
          aria-label="模式"
          value={settings.mode}
          onChange={(e) => save({ ...settings, mode: e.target.value as Mode })}
        >
          <option value="ai">人机对弈</option>
          <option value="local">双人同屏</option>
        </select>
        {settings.mode === 'ai' && (
          <select
            aria-label="难度（下局生效）"
            value={settings.level}
            onChange={(e) =>
              save({
                ...settings,
                level: Number(e.target.value) as GomokuLevel,
              })
            }
          >
            {(Object.keys(GOMOKU_LEVELS) as unknown as GomokuLevel[]).map(
              (l) => (
                <option key={l} value={l}>
                  {GOMOKU_LEVELS[l].name}（{GOMOKU_LEVELS[l].note}）
                </option>
              ),
            )}
          </select>
        )}
        <label className="kit-check">
          <input
            type="checkbox"
            checked={settings.renju}
            onChange={(e) => save({ ...settings, renju: e.target.checked })}
          />{' '}
          黑棋禁手
        </label>
        <button
          type="button"
          className="kit-primary"
          onClick={() => start(BLACK)}
        >
          {settings.mode === 'ai' ? '执黑开局' : '新开一局'}
        </button>
        {settings.mode === 'ai' && (
          <button type="button" onClick={() => start(WHITE)}>
            执白开局
          </button>
        )}
      </div>
      <div className="kit-row">
        <span className="kit-stats">
          <output
            className={
              state.winner !== null &&
              state.winner === human &&
              match.mode === 'ai'
                ? 'kit-ok'
                : undefined
            }
            aria-live="polite"
          >
            {status}
          </output>
          <span>
            第 {state.moves.length} 手
            {last !== undefined ? ` · ${coord(last)}` : ''}
          </span>
          {stats && (
            <span>
              本档 {stats.won} 胜 / {stats.played} 局
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={takeBack}
          disabled={!state.moves.length || thinking || state.winner !== null}
        >
          <Undo2 size={15} aria-hidden="true" /> 悔棋
        </button>
        <button
          type="button"
          onClick={askHint}
          disabled={state.winner !== null || aiTurn}
        >
          <Lightbulb size={15} aria-hidden="true" /> 提示
        </button>
        <button
          type="button"
          onClick={() =>
            commit(resign(state, match.mode === 'ai' ? human : state.toPlay))
          }
          disabled={state.winner !== null || !state.moves.length}
        >
          <Flag size={15} aria-hidden="true" /> 认输
        </button>
        {state.winner !== null && (
          <button
            type="button"
            className="kit-primary"
            onClick={() =>
              start(
                match.mode === 'ai' ? (human === BLACK ? WHITE : BLACK) : BLACK,
              )
            }
          >
            <RotateCcw size={15} aria-hidden="true" /> 再来一局
          </button>
        )}
      </div>
      <GomokuBoard
        cells={state.cells}
        last={last}
        line={state.line}
        forbidden={forbidden}
        hint={hint}
        disabled={aiTurn || state.winner !== null}
        onPlay={onPlay}
      />
      {hint !== null && (
        <p className="kit-brief">
          提示：可以考虑 {coord(hint)}（棋盘上的蓝点）
        </p>
      )}
      <p className="kit-help">
        黑先，横、竖、斜任意方向连成五子即胜。勾选「黑棋禁手」后按连珠规则：黑棋的三三、四四、长连为禁手（棋盘上以红叉标出），白棋没有禁手。AI
        分十档，在浏览器后台计算，不会卡住页面。
      </p>
    </div>
  );
}
