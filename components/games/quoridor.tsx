'use client';

import { Flag, Lightbulb, Undo2 } from 'lucide-react';
import { useEffect, useEffectEvent, useState, type ReactNode } from 'react';
import {
  WALLS,
  moveName,
  newGame,
  play,
  resign,
  undo as undoMoves,
  type Move,
  type QuoridorState,
  type Side,
} from '@/lib/games/quoridor';
import {
  QUORIDOR_LEVELS,
  type QuoridorAiResult,
  type QuoridorLevel,
} from '@/lib/games/quoridor-ai';
import { QuoridorBoard, type BoardMode } from './quoridor-board';
import { GameResult } from './result';
import { useLocalRecords } from './kit';
import './kit.css';
// Vite provides the default URL export for this worker asset.
// oxlint-disable-next-line import/default
import quoridorWorkerUrl from './quoridor-worker.ts?worker&url';

export const QD_NAME = ['朱', '黛'] as const;
const SETTINGS = 'tscjj:quoridor-settings:v1';
const RECORDS = 'tscjj:quoridor-records:v1';
type Mode = 'ai' | 'local';
type Settings = { mode: Mode; level: QuoridorLevel };
type Records = Partial<Record<QuoridorLevel, { won: number; played: number }>>;
const isLevel = (v: unknown): v is QuoridorLevel =>
  typeof v === 'number' && v in QUORIDOR_LEVELS;
function validateSettings(v: unknown): Settings | null {
  const o = v as Partial<Settings> | null;
  if (!o || (o.mode !== 'ai' && o.mode !== 'local') || !isLevel(o.level))
    return null;
  return { mode: o.mode, level: o.level };
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

function requestAi(
  state: QuoridorState,
  level: QuoridorLevel,
  resolve: (r: QuoridorAiResult) => void,
  reject: () => void,
) {
  let worker: Worker | undefined;
  let live = true;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    live = false;
    clearTimeout(timeout);
    worker?.terminate();
  };
  const fail = () => {
    if (!live) return;
    cancel();
    reject();
  };
  try {
    worker = new Worker(quoridorWorkerUrl, { type: 'module' });
    worker.onmessage = (e) => {
      if (!live || e.data?.id !== 1) return;
      if (e.data.error || !e.data.result?.move) return fail();
      cancel();
      resolve(e.data.result);
    };
    worker.onerror = (e) => {
      e.preventDefault();
      fail();
    };
    worker.onmessageerror = fail;
    timeout = setTimeout(fail, 10000);
    worker.postMessage({ id: 1, state, level });
  } catch {
    fail();
  }
  return cancel;
}

/** Player strip: colour, name, walls left. */
export function QuoridorPlayers({
  state,
  names,
}: {
  state: QuoridorState;
  names: [ReactNode, ReactNode];
}) {
  return (
    <div className="qd-side">
      {([0, 1] as Side[]).map((p) => (
        <span key={p} className={`qd-player p${p}`}>
          <i aria-hidden="true" />
          <strong>{names[p]}</strong>
          <span className="qd-stock" aria-label={`剩余 ${state.left[p]} 块墙`}>
            {Array.from({ length: WALLS }, (_, k) => (
              <b
                key={k}
                className={k < state.left[p] ? undefined : 'is-used'}
              />
            ))}
          </span>
          <span className="kit-help">墙 {state.left[p]}</span>
        </span>
      ))}
    </div>
  );
}

export function ModeSwitch({
  mode,
  setMode,
  disabled,
  wallsLeft,
}: {
  mode: BoardMode;
  setMode: (m: BoardMode) => void;
  disabled?: boolean;
  wallsLeft: number;
}) {
  return (
    <fieldset className="qd-modes" aria-label="操作">
      <button
        type="button"
        aria-pressed={mode === 'move'}
        data-shortcut="m"
        onClick={() => setMode('move')}
        disabled={disabled}
      >
        走棋
      </button>
      <button
        type="button"
        aria-pressed={mode === 'h'}
        data-shortcut="h"
        onClick={() => setMode('h')}
        disabled={disabled || !wallsLeft}
      >
        横墙
      </button>
      <button
        type="button"
        aria-pressed={mode === 'v'}
        data-shortcut="v"
        onClick={() => setMode('v')}
        disabled={disabled || !wallsLeft}
      >
        竖墙
      </button>
    </fieldset>
  );
}

export function QuoridorGame({
  fromExplore = false,
}: {
  fromExplore?: boolean;
}) {
  const [settings, saveSettings] = useLocalRecords(SETTINGS, validateSettings, {
    mode: 'ai',
    level: 3,
  } as Settings);
  const [records, saveRecords] = useLocalRecords(RECORDS, validateRecords, {});
  const [human, setHuman] = useState<Side>(0);
  const [game, setGame] = useState<{ match: Settings; state: QuoridorState }>(
    () => ({
      match: settings,
      state: newGame(0),
    }),
  );
  const [mode, setMode] = useState<BoardMode>('move');
  const [hint, setHint] = useState<Move | null>(null);
  const [hinting, setHinting] = useState(false);
  const [aiError, setAiError] = useState(false);
  const [retry, setRetry] = useState(0);
  const { match, state } = game;
  const aiTurn =
    match.mode === 'ai' && state.winner === null && state.toPlay !== human;

  const commit = (next: QuoridorState) => {
    setHint(null);
    setAiError(false);
    setMode('move');
    setGame({ match, state: next });
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
  const commitAi = useEffectEvent(commit);
  useEffect(() => {
    if (!aiTurn) return;
    const t0 = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = requestAi(
      state,
      match.level,
      (r) => {
        try {
          const next = play(state, r.move);
          timer = setTimeout(
            () => commitAi(next),
            Math.max(0, 450 - (Date.now() - t0)),
          );
        } catch {
          setAiError(true);
        }
      },
      () => setAiError(true),
    );
    return () => {
      cancel();
      clearTimeout(timer);
    };
  }, [aiTurn, state, match.level, retry]);

  const start = (side: Side) => {
    setHuman(side);
    setHint(null);
    setAiError(false);
    setMode('move');
    setGame({ match: settings, state: newGame(0) });
  };
  const onMove = (m: Move) => {
    if (aiTurn) return;
    try {
      commit(play(state, m));
    } catch {
      /* illegal clicks are ignored; the board only offers legal ones */
    }
  };
  const askHint = () => {
    setHinting(true);
    requestAi(
      state,
      5,
      (r) => {
        setHinting(false);
        setHint(r.move);
      },
      () => setHinting(false),
    );
  };
  const takeBack = () =>
    commit(
      undoMoves(
        state,
        match.mode === 'local' ? 1 : state.toPlay === human ? 2 : 1,
      ),
    );

  const names: [string, string] =
    match.mode === 'ai'
      ? human === 0
        ? ['你（朱）', `AI（黛）`]
        : ['AI（朱）', '你（黛）']
      : ['朱方', '黛方'];
  const stats = match.mode === 'ai' ? records[match.level] : undefined;
  const status = aiError
    ? 'AI 计算失败，请重试'
    : aiTurn
      ? 'AI 思考中…'
      : state.winner === null
        ? match.mode === 'ai'
          ? `轮到你 · ${mode === 'move' ? '点亮点走棋' : '点交叉点放墙（再点一次确认）'}`
          : `轮到${QD_NAME[state.toPlay]}方`
        : '';
  const won = match.mode === 'ai' ? state.winner === human : true;
  return (
    <div className="kit quoridor">
      <header className="kit-head">
        <div>
          <p className="kit-kicker">
            QUORIDOR · 9×9 · 每人 10 墙 ·{' '}
            {match.mode === 'ai'
              ? `${QUORIDOR_LEVELS[match.level].name}`
              : '双人同屏'}
          </p>
          <h2 className="kit-sr">步步为营</h2>
        </div>
        <a
          className="qd-online-link"
          href={`/games/quoridor/online${fromExplore ? '?from=explore' : ''}`}
        >
          和朋友联机 →
        </a>
      </header>
      <div className="kit-row">
        <select
          aria-label="模式（下局生效）"
          value={settings.mode}
          onChange={(e) =>
            saveSettings({ ...settings, mode: e.target.value as Mode })
          }
        >
          <option value="ai">人机对弈</option>
          <option value="local">双人同屏</option>
        </select>
        {settings.mode === 'ai' && (
          <select
            aria-label="难度（下局生效）"
            value={settings.level}
            onChange={(e) =>
              saveSettings({
                ...settings,
                level: Number(e.target.value) as QuoridorLevel,
              })
            }
          >
            {(Object.keys(QUORIDOR_LEVELS).map(Number) as QuoridorLevel[]).map(
              (l) => (
                <option key={l} value={l}>
                  {QUORIDOR_LEVELS[l].name}（{QUORIDOR_LEVELS[l].note}）
                </option>
              ),
            )}
          </select>
        )}
        <button
          type="button"
          className="kit-primary"
          data-shortcut="r"
          onClick={() => start(0)}
        >
          {settings.mode === 'ai' ? '先手开局' : '新开一局'}
        </button>
        {settings.mode === 'ai' && (
          <button type="button" onClick={() => start(1)}>
            后手开局
          </button>
        )}
      </div>
      <QuoridorPlayers state={state} names={names} />
      <div className="kit-row">
        <ModeSwitch
          mode={mode}
          setMode={setMode}
          disabled={aiTurn || state.winner !== null}
          wallsLeft={state.left[state.toPlay]}
        />
        <button
          type="button"
          data-shortcut="z"
          onClick={takeBack}
          disabled={!state.history.length || aiTurn}
        >
          <Undo2 size={15} aria-hidden="true" /> 悔棋
        </button>
        <button
          type="button"
          onClick={askHint}
          disabled={aiTurn || hinting || state.winner !== null}
        >
          <Lightbulb size={15} aria-hidden="true" />{' '}
          {hinting ? '计算中…' : '提示'}
        </button>
        {aiError && (
          <button
            type="button"
            onClick={() => (setAiError(false), setRetry((n) => n + 1))}
          >
            重试 AI
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            commit(resign(state, match.mode === 'ai' ? human : state.toPlay))
          }
          disabled={state.winner !== null || !state.history.length || aiTurn}
        >
          <Flag size={15} aria-hidden="true" /> 认输
        </button>
        <span className="kit-stats">
          <output aria-live="polite">{status}</output>
          <span>第 {state.history.length} 手</span>
          {stats && (
            <span>
              本档 {stats.won} 胜 / {stats.played} 局
            </span>
          )}
        </span>
      </div>
      {state.winner !== null && (
        <GameResult
          tone={won ? 'win' : 'lose'}
          title={
            match.mode === 'ai'
              ? state.winner === human
                ? '你赢了'
                : 'AI 赢了'
              : `${QD_NAME[state.winner]}方获胜`
          }
          actions={[
            {
              label: '再来一局',
              primary: true,
              onClick: () =>
                start(match.mode === 'ai' ? ((1 - human) as Side) : 0),
            },
          ]}
        >
          {state.reason === 'resign' ? '对方认输' : '率先抵达对岸'} · 共{' '}
          {state.history.length} 手
          {match.mode === 'ai' ? ' · 再来一局交换先后手' : ''}
        </GameResult>
      )}
      <QuoridorBoard
        state={state}
        mode={mode}
        disabled={aiTurn}
        onMove={onMove}
        hint={hint}
        you={match.mode === 'ai' ? human : null}
      />
      {hint && (
        <p className="kit-brief">提示：可以考虑 {moveName(hint)}（蓝色标记）</p>
      )}
      <p className="kit-help">
        朱方从下往上、黛方从上往下，先走到对岸任意一格的人赢。每回合要么走一步，要么放一块墙（每人
        10
        块）；墙不能把任何一方的路完全堵死。面对面时可以跳过对方，背后有墙就斜着绕。快捷键：M
        走棋、H 横墙、V 竖墙。
      </p>
    </div>
  );
}
