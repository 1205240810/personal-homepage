'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import {
  apply,
  newGame,
  viewFor,
  type BrocadeState,
  type Move,
  type Side,
} from '@/lib/games/brocade';
import {
  BROCADE_LEVELS,
  type BrocadeAiResult,
  type BrocadeLevel,
} from '@/lib/games/brocade-ai';
import { GameResult } from '../result';
import { useLocalRecords } from '../kit';
import '../kit.css';
import { BrocadeTable, Chip } from './table';
import { describeMove, finalText } from './text';
// Vite provides the default URL export for this worker asset.
// oxlint-disable-next-line import/default
import brocadeWorkerUrl from '../brocade-worker.ts?worker&url';

const ME: Side = 0;
const AI: Side = 1;
type Settings = { level: BrocadeLevel };
type Records = Partial<Record<BrocadeLevel, { won: number; played: number }>>;
const isLevel = (v: unknown): v is BrocadeLevel =>
  typeof v === 'number' && v in BROCADE_LEVELS;
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
  state: BrocadeState,
  level: BrocadeLevel,
  resolve: (r: BrocadeAiResult) => void,
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
    worker = new Worker(brocadeWorkerUrl, { type: 'module' });
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

export function BrocadeGame({
  fromExplore = false,
}: {
  fromExplore?: boolean;
}) {
  const [settings, saveSettings] = useLocalRecords(
    'tscjj:brocade-settings:v1',
    validateSettings,
    { level: 3 } as Settings,
  );
  const [records, saveRecords] = useLocalRecords<Records>(
    'tscjj:brocade-records:v1',
    validateRecords,
    {},
  );
  const [game, setGame] = useState<{
    level: BrocadeLevel;
    state: BrocadeState;
  } | null>(null);
  const [aiError, setAiError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const state = game?.state ?? null;
  const level = game?.level ?? settings.level;
  const aiTurn = !!state && state.phase === 'play' && state.toPlay === AI;

  const commit = (next: BrocadeState) => {
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
    if (!state) return false;
    try {
      commit(apply(state, ME, m));
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作无效');
      return false;
    }
  };
  const v = state ? viewFor(state, ME) : null;
  const stats = records[level];
  const lastAi =
    state?.last?.side === AI
      ? describeMove(state.last.move, state.last.noble)
      : null;
  const status = !state
    ? null
    : error
      ? error
      : aiError
        ? 'AI 计算失败，请重试'
        : aiTurn
          ? 'AI 盘算中…'
          : state.phase === 'play'
            ? `${lastAi ? `AI ${lastAi}。` : ''}轮到你：取丝线、预订或购入织品`
            : null;
  return (
    <div className="kit brocade">
      <header className="kit-head">
        <div>
          <p className="kit-kicker">
            BROCADE GUILD · 两人 · {BROCADE_LEVELS[level].name}
          </p>
          <h2 className="kit-sr">锦绣织造</h2>
        </div>
        <a
          className="bc-online-link"
          href={`/games/brocade/online${fromExplore ? '?from=explore' : ''}`}
        >
          和朋友联机 →
        </a>
      </header>
      <div className="kit-row">
        <select
          aria-label="难度（下局生效）"
          value={settings.level}
          onChange={(e) =>
            saveSettings({ level: Number(e.target.value) as BrocadeLevel })
          }
        >
          {(Object.keys(BROCADE_LEVELS).map(Number) as BrocadeLevel[]).map(
            (l) => (
              <option key={l} value={l}>
                {BROCADE_LEVELS[l].name}（{BROCADE_LEVELS[l].note}）
              </option>
            ),
          )}
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
        <BrocadeTable
          v={v}
          positionKey={state}
          disabled={aiTurn}
          names={['你', `AI · ${BROCADE_LEVELS[level].name}`]}
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
        <div className="bc-intro">
          <span aria-hidden="true">
            {([0, 1, 2, 3, 4, 5] as const).map((g) => (
              <Chip key={g} g={g} />
            ))}
          </span>
          <p>
            五色丝线——朱砂、石青、藤黄、黛墨、素丝，外加万能的金线。收丝线、购入织品，每件织品都是以后购物的永久折扣；攒够某几色织品，贵客自会登门。先到
            15 点声望的一方，在这一圈结束后定胜负。
          </p>
          <button type="button" className="kit-primary" onClick={start}>
            开局
          </button>
        </div>
      )}
      <p className="kit-help">
        每回合四选一：取三种不同颜色的丝线各一枚；取同色两枚（该色需剩至少 4
        枚）；预订一件织品（明牌或牌堆顶暗订，最多 3
        件，同时得一枚金线）；或支付丝线购入一件织品（已有的同色织品抵扣）。手中丝线上限
        10 枚，超出须退还。满足贵客要求的织品数时贵客自动登门（+3）。有人到 15
        点后打完这一圈，声望高者胜，同分比织品少者胜。仅当没有任何可执行行动时可过牌，双方连续被迫过牌则和局。
      </p>
    </div>
  );
}
