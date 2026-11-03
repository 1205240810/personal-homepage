'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import {
  CAMEL,
  apply,
  newGame,
  nextRound,
  viewFor,
  type BazaarState,
  type Move,
  type Side,
} from '@/lib/games/bazaar';
import {
  BAZAAR_LEVELS,
  type BazaarAiResult,
  type BazaarLevel,
} from '@/lib/games/bazaar-ai';
import { GameResult } from '../result';
import { useLocalRecords } from '../kit';
import '../kit.css';
import { BazaarTable, Ware } from './table';
import { describeMove, roundSummary } from './text';
// Vite provides the default URL export for this worker asset.
// oxlint-disable-next-line import/default
import bazaarWorkerUrl from '../bazaar-worker.ts?worker&url';

const ME: Side = 0;
const AI: Side = 1;
type Settings = { level: BazaarLevel };
type Records = Partial<Record<BazaarLevel, { won: number; played: number }>>;
const isLevel = (v: unknown): v is BazaarLevel =>
  typeof v === 'number' && v in BAZAAR_LEVELS;
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
  state: BazaarState,
  level: BazaarLevel,
  resolve: (r: BazaarAiResult) => void,
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
    worker = new Worker(bazaarWorkerUrl, { type: 'module' });
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

export function BazaarGame({ fromExplore = false }: { fromExplore?: boolean }) {
  const [settings, saveSettings] = useLocalRecords(
    'tscjj:bazaar-settings:v1',
    validateSettings,
    { level: 3 } as Settings,
  );
  const [records, saveRecords] = useLocalRecords<Records>(
    'tscjj:bazaar-records:v1',
    validateRecords,
    {},
  );
  const [game, setGame] = useState<{
    level: BazaarLevel;
    state: BazaarState;
  } | null>(null);
  const [aiError, setAiError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const state = game?.state ?? null;
  const level = game?.level ?? settings.level;
  const aiTurn = !!state && state.phase === 'play' && state.toPlay === AI;

  const commit = (next: BazaarState) => {
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
            Math.max(0, 650 - (Date.now() - t0)),
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
  const status = !state
    ? null
    : error
      ? error
      : aiError
        ? 'AI 计算失败，请重试'
        : aiTurn
          ? 'AI 盘算中…'
          : state.phase === 'play'
            ? `${lastAi ? `AI ${lastAi}。` : ''}轮到你：选货后点动作`
            : null;
  return (
    <div className="kit bazaar">
      <header className="kit-head">
        <div>
          <p className="kit-kicker">
            ZAYTON BAZAAR · 三局两胜 · {BAZAAR_LEVELS[level].name}
            {state ? ` · 第 ${state.round} 局` : ''}
          </p>
          <h2 className="kit-sr">刺桐市集</h2>
        </div>
        <a
          className="bz-online-link"
          href={`/games/bazaar/online${fromExplore ? '?from=explore' : ''}`}
        >
          和朋友联机 →
        </a>
      </header>
      <div className="kit-row">
        <select
          aria-label="难度（下局生效）"
          value={settings.level}
          onChange={(e) =>
            saveSettings({ level: Number(e.target.value) as BazaarLevel })
          }
        >
          {(Object.keys(BAZAAR_LEVELS).map(Number) as BazaarLevel[]).map(
            (l) => (
              <option key={l} value={l}>
                {BAZAAR_LEVELS[l].name}（{BAZAAR_LEVELS[l].note}）
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
        <BazaarTable
          key={`${state.round}`}
          v={v}
          disabled={aiTurn}
          names={['你', `AI · ${BAZAAR_LEVELS[level].name}`]}
          onMove={onMove}
          status={status}
          footer={
            state.phase === 'round-end' && state.roundResult ? (
              <div className="kit-row bz-actions">
                <span>{roundSummary(state.roundResult, ME, ['你', 'AI'])}</span>
                <button
                  type="button"
                  className="kit-primary"
                  onClick={() => commit(nextRound(state, Math.random))}
                >
                  下一局（输家先手）
                </button>
              </div>
            ) : state.phase === 'over' && state.roundResult ? (
              <GameResult
                tone={state.winner === ME ? 'win' : 'lose'}
                title={
                  state.winner === ME ? '你赢下两枚市舶印' : 'AI 赢下两枚市舶印'
                }
                actions={[{ label: '再来一局', onClick: start, primary: true }]}
              >
                {roundSummary(state.roundResult, ME, ['你', 'AI'])} · 印{' '}
                {state.seals[ME]} : {state.seals[AI]}
              </GameResult>
            ) : null
          }
        />
      ) : (
        <div className="bz-intro">
          <span aria-hidden="true">
            {([0, 1, 2, 3, 4, 5, CAMEL] as const).map((c) => (
              <Ware key={c} c={c} />
            ))}
          </span>
          <p>
            宋元泉州，刺桐港万商云集。你和对手在同一个市集上进货、换货、出货：货卖得越早银牌越值钱，一次卖三件以上还有赏银；骆驼能换货，驼队最大的人另得
            5 两。先赢两局拿到两枚市舶印的人获胜。
          </p>
          <button type="button" className="kit-primary" onClick={start}>
            开局
          </button>
        </div>
      )}
      <p className="kit-help">
        每回合四选一：拿一件货（手里最多 7
        件）；牵走市集里全部骆驼；换货（拿走至少 2
        件，用同样件数的手牌或骆驼换，不能换同一种）；卖出同一种货若干件（明珠、金锭、银锭至少
        2 件）。三种银牌卖空或货栈补不满市集时本局结束。快捷键：T 拿一件、C
        牵骆驼、E 换货、S 卖货。
      </p>
    </div>
  );
}
