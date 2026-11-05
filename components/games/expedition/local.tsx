'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import {
  ROUTE_INFO,
  apply,
  newGame,
  nextRound,
  viewFor,
  type ExpeditionState,
  type Move,
  type Side,
} from '@/lib/games/expedition';
import {
  EXPEDITION_LEVELS,
  type ExpeditionAiResult,
  type ExpeditionLevel,
} from '@/lib/games/expedition-ai';
import { GameResult } from '../result';
import { useLocalRecords } from '../kit';
import '../kit.css';
import { Card, ExpeditionTable } from './table';
// Vite provides the default URL export for this worker asset.
// oxlint-disable-next-line import/default
import expeditionWorkerUrl from '../expedition-worker.ts?worker&url';

const ME: Side = 0;
const AI: Side = 1;
type Settings = { level: ExpeditionLevel; rounds: 1 | 3 };
type Records = Partial<
  Record<ExpeditionLevel, { won: number; played: number }>
>;
const isLevel = (v: unknown): v is ExpeditionLevel =>
  typeof v === 'number' && v in EXPEDITION_LEVELS;
const validateSettings = (v: unknown): Settings | null => {
  const o = v as Partial<Settings> | null;
  return o && isLevel(o.level)
    ? { level: o.level, rounds: o.rounds === 1 ? 1 : 3 }
    : null;
};
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
  state: ExpeditionState,
  level: ExpeditionLevel,
  resolve: (r: ExpeditionAiResult) => void,
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
    worker = new Worker(expeditionWorkerUrl, { type: 'module' });
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

export function ExpeditionGame({
  fromExplore = false,
}: {
  fromExplore?: boolean;
}) {
  const [settings, saveSettings] = useLocalRecords(
    'tscjj:expedition-settings:v1',
    validateSettings,
    {
      level: 3,
      rounds: 3,
    } as Settings,
  );
  const [records, saveRecords] = useLocalRecords<Records>(
    'tscjj:expedition-records:v1',
    validateRecords,
    {},
  );
  const [game, setGame] = useState<{
    level: ExpeditionLevel;
    state: ExpeditionState;
  } | null>(null);
  const [matchId, setMatchId] = useState(0);
  const [aiError, setAiError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const state = game?.state ?? null;
  const level = game?.level ?? settings.level;
  const aiTurn =
    !!state &&
    state.toPlay === AI &&
    (state.phase === 'play' || state.phase === 'draw');

  const commit = (next: ExpeditionState) => {
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
            Math.max(0, 550 - (Date.now() - t0)),
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
    setMatchId((n) => n + 1);
    setAiError(false);
    setError(null);
    setGame({
      level: settings.level,
      state: newGame(Math.random, ME, settings.rounds),
    });
  };
  const onMove = (m: Move) => {
    if (!state) return false;
    try {
      commit(apply(state, ME, m));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作无效');
      return false;
    }
  };
  const v = state ? viewFor(state, ME) : null;
  const stats = records[level];
  const status = !state
    ? null
    : error
      ? error
      : aiError
        ? 'AI 计算失败，请重试'
        : aiTurn
          ? 'AI 思考中…'
          : state.phase === 'play'
            ? '轮到你：选一张手牌，出到商路或弃到驿站'
            : state.phase === 'draw'
              ? '再摸一张：点牌堆，或点亮起的驿站'
              : null;
  const last = state?.roundScores[state.roundScores.length - 1];
  return (
    <div className="kit expedition">
      <header className="kit-head">
        <div>
          <p className="kit-kicker">
            SILK ROAD · 五路远行 · {EXPEDITION_LEVELS[level].name}
            {state ? ` · 第 ${state.round} / ${state.rounds} 轮` : ''}
          </p>
          <h2 className="kit-sr">丝路远行</h2>
        </div>
        <a
          className="ex-online-link"
          href={`/games/expedition/online${fromExplore ? '?from=explore' : ''}`}
        >
          和朋友联机 →
        </a>
      </header>
      <div className="kit-row">
        <select
          aria-label="难度（下局生效）"
          value={settings.level}
          onChange={(e) =>
            saveSettings({
              ...settings,
              level: Number(e.target.value) as ExpeditionLevel,
            })
          }
        >
          {(
            Object.keys(EXPEDITION_LEVELS).map(Number) as ExpeditionLevel[]
          ).map((l) => (
            <option key={l} value={l}>
              {EXPEDITION_LEVELS[l].name}（{EXPEDITION_LEVELS[l].note}）
            </option>
          ))}
        </select>
        <select
          aria-label="轮数（下局生效）"
          value={settings.rounds}
          onChange={(e) =>
            saveSettings({
              ...settings,
              rounds: Number(e.target.value) === 1 ? 1 : 3,
            })
          }
        >
          <option value={3}>三轮累计</option>
          <option value={1}>单轮快局</option>
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
        {stats && (
          <span className="kit-stats">
            本档 {stats.won} 胜 / {stats.played} 局
          </span>
        )}
      </div>
      {v && state ? (
        <ExpeditionTable
          key={`${matchId}:${state.round}`}
          v={v}
          disabled={aiTurn}
          names={['你', `AI · ${EXPEDITION_LEVELS[level].name}`]}
          onMove={onMove}
          status={status}
          footer={
            state.phase === 'round-end' && last ? (
              <div className="kit-row ex-actions">
                <span>
                  第 {state.round} 轮：你 {last[ME]}，AI {last[AI]}（累计{' '}
                  {state.totals[ME]} : {state.totals[AI]}）
                </span>
                <button
                  type="button"
                  className="kit-primary"
                  onClick={() => commit(nextRound(state, Math.random))}
                >
                  下一轮（交换先手）
                </button>
              </div>
            ) : state.phase === 'over' ? (
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
                {state.rounds > 1 ? `${state.rounds} 轮累计` : '单轮'}：你{' '}
                {state.totals[ME]}，AI {state.totals[AI]}
                {state.rounds > 1 &&
                  ` · 各轮 ${state.roundScores.map((r) => `${r[ME]}:${r[AI]}`).join(' / ')}`}
              </GameResult>
            ) : null
          }
        />
      ) : (
        <div className="ex-intro">
          <span className="ex-routes" aria-hidden="true">
            {ROUTE_INFO.map((_, r) => (
              <Card key={r} c={r * 12 + (r === 2 ? 0 : 3 + r * 2)} />
            ))}
          </span>
          <p>
            五条商路从长安通往波斯。每开辟一条路要先垫上 20
            的盘缠，驿站牌只能越走越远；开路前押下「投契」，这条路的盈亏就翻倍。走得远才赚，半途而废就亏。
          </p>
          <button type="button" className="kit-primary" onClick={start}>
            开局
          </button>
        </div>
      )}
      <p className="kit-help">
        每回合两步：先把一张手牌出到自己的商路（面值必须比这条路上的牌大，投契只能在开路前出），或弃到同色驿站；再从牌堆或任一驿站顶上摸一张（不能摸回刚弃的那张）。牌堆摸完本轮结束。快捷键：P
        出牌、X 弃牌、D 摸牌堆。
      </p>
    </div>
  );
}
