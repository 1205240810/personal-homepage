'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import {
  apply,
  newGame,
  viewFor,
  type GlazeState,
  type Move,
  type Side,
} from '@/lib/games/glaze';
import {
  GLAZE_LEVELS,
  type GlazeAiResult,
  type GlazeLevel,
} from '@/lib/games/glaze-ai';
import { GameResult } from '../result';
import { useLocalRecords } from '../kit';
import '../kit.css';
import { GlazeTable, Tile } from './table';
import { describeMove, finalText } from './text';
// Vite provides the default URL export for this worker asset.
// oxlint-disable-next-line import/default
import glazeWorkerUrl from '../glaze-worker.ts?worker&url';

const ME: Side = 0;
const AI: Side = 1;
type Settings = { level: GlazeLevel };
type Records = Partial<Record<GlazeLevel, { won: number; played: number }>>;
const isLevel = (v: unknown): v is GlazeLevel =>
  typeof v === 'number' && v in GLAZE_LEVELS;
const validateSettings = (v: unknown): Settings | null =>
  v && typeof v === 'object' && isLevel((v as Settings).level)
    ? { level: (v as Settings).level }
    : null;
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
  state: GlazeState,
  level: GlazeLevel,
  resolve: (r: GlazeAiResult) => void,
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
    worker = new Worker(glazeWorkerUrl, { type: 'module' });
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
    worker.postMessage({ id: 1, view: viewFor(state, AI), side: AI, level });
  } catch {
    fail();
  }
  return cancel;
}

export function GlazeGame({ fromExplore = false }: { fromExplore?: boolean }) {
  const [settings, saveSettings] = useLocalRecords(
    'tscjj:glaze-settings:v1',
    validateSettings,
    { level: 3 } as Settings,
  );
  const [records, saveRecords] = useLocalRecords<Records>(
    'tscjj:glaze-records:v1',
    validateRecords,
    {},
  );
  const [game, setGame] = useState<{
    level: GlazeLevel;
    state: GlazeState;
  } | null>(null);
  const [aiError, setAiError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const state = game?.state ?? null;
  const level = game?.level ?? settings.level;
  const aiTurn = !!state && state.phase === 'play' && state.toPlay === AI;

  const commit = (next: GlazeState) => {
    setError(null);
    setGame({ level, state: next });
    if (next.phase === 'over' && state?.phase !== 'over') {
      const cur = records[level] ?? { won: 0, played: 0 };
      saveRecords({
        ...records,
        [level]: {
          won: cur.won + (next.winner === ME ? 1 : 0),
          played: cur.played + 1,
        },
      });
    }
  };
  const commitAi = useEffectEvent(commit);
  useEffect(() => {
    if (!aiTurn || !state) return;
    const t0 = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = requestAi(
      state,
      level,
      (r) => {
        try {
          const next = apply(state, AI, r.move);
          timer = setTimeout(
            () => commitAi(next),
            Math.max(0, 600 - (Date.now() - t0)),
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
  }, [aiTurn, state, level, retry]);

  const start = () => {
    setAiError(false);
    setError(null);
    setGame({ level: settings.level, state: newGame(Math.random, ME) });
  };
  const onMove = (m: Move) => {
    if (!state) return;
    try {
      commit(apply(state, ME, m));
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作无效');
    }
  };
  const v = state ? viewFor(state, ME) : null;
  const stats = records[level];
  const lastAi =
    state?.last?.side === AI ? describeMove(state.last.move) : null;
  const gained =
    state?.lastRound && state.round > 1 && state.last?.side !== undefined
      ? state.lastRound.gained
      : null;
  const status = !state
    ? null
    : error
      ? error
      : aiError
        ? 'AI 计算失败，请重试'
        : aiTurn
          ? 'AI 斟酌中…'
          : state.phase === 'play'
            ? `${lastAi ? `AI ${lastAi}。` : ''}轮到你：点一块釉砖，再点料架`
            : null;
  return (
    <div className="kit glaze">
      <header className="kit-head">
        <div>
          <p className="kit-kicker">
            GLAZE WORKSHOP · 两人 · {GLAZE_LEVELS[level].name}
            {state ? ` · 第 ${state.round} 轮` : ''}
          </p>
          <h2 className="kit-sr">琉璃坊</h2>
        </div>
        <a
          className="gz-online-link"
          href={`/games/glaze/online${fromExplore ? '?from=explore' : ''}`}
        >
          和朋友联机 →
        </a>
      </header>
      <div className="kit-row">
        <select
          aria-label="难度（下局生效）"
          value={settings.level}
          onChange={(e) =>
            saveSettings({ level: Number(e.target.value) as GlazeLevel })
          }
        >
          {(Object.keys(GLAZE_LEVELS).map(Number) as GlazeLevel[]).map((l) => (
            <option key={l} value={l}>
              {GLAZE_LEVELS[l].name}（{GLAZE_LEVELS[l].note}）
            </option>
          ))}
        </select>
        <button
          type="button"
          className="kit-primary"
          data-shortcut="r"
          onClick={start}
        >
          {state ? '重新开局' : '开局'}
        </button>
        {aiError && (
          <button
            type="button"
            onClick={() => (setAiError(false), setRetry((n) => n + 1))}
          >
            重试 AI
          </button>
        )}
        {gained && state?.phase === 'play' && (
          <span className="kit-stats">
            上一轮贴砖：你 {gained[ME] >= 0 ? '+' : ''}
            {gained[ME]}，AI {gained[AI] >= 0 ? '+' : ''}
            {gained[AI]}
          </span>
        )}
        {stats && (
          <span className="kit-stats">
            本档 {stats.won} 胜 / {stats.played} 局
          </span>
        )}
      </div>
      {v && state ? (
        <GlazeTable
          v={v}
          disabled={aiTurn}
          names={['你', `AI · ${GLAZE_LEVELS[level].name}`]}
          onMove={onMove}
          status={status}
          footer={
            state.phase === 'over' ? (
              <GameResult
                tone={state.winner === ME ? 'win' : 'lose'}
                title={
                  state.winner === ME
                    ? '你赢了'
                    : state.winner === 'draw'
                      ? '平局'
                      : 'AI 赢了'
                }
                actions={[{ label: '再来一局', onClick: start, primary: true }]}
              >
                {finalText(state, ME, ['你', 'AI'])}
              </GameResult>
            ) : null
          }
        />
      ) : (
        <div className="gz-intro">
          <span aria-hidden="true">
            {([0, 1, 2, 3, 4] as const).map((c) => (
              <Tile key={c} c={c} />
            ))}
          </span>
          <p>
            窑口一开，五色釉砖出炉：天青、霁红、鹅黄、墨玉、月白。从窑口挑走一种颜色，摆上料架；一层摆满，轮末就贴上照壁，与相邻的釉砖连成片越多，得分越高。拿多了的只能摔进碎瓷区扣分。
          </p>
          <button type="button" className="kit-primary" onClick={start}>
            开局
          </button>
        </div>
      )}
      <p className="kit-help">
        每回合从一个窑口拿走某种颜色的全部釉砖（其余推到案台），或从案台拿走某种颜色的全部（当轮第一个拿案台的人同时拿到「开窑令」，下轮先手，但算一块碎瓷）。放到料架某一层：同层只能放同色，照壁这一行已有该色就不能放；放不下的进碎瓷区扣分。有人贴满照壁一整行，这一轮结束后游戏结束。
      </p>
    </div>
  );
}
