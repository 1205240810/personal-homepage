'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  apply,
  decider,
  newGame,
  nextRound,
  viewFor,
  type HanamiState,
  type Move,
  type Side,
} from '@/lib/games/hanami';
import {
  HANAMI_LEVELS,
  type HanamiAiResult,
  type HanamiLevel,
} from '@/lib/games/hanami-ai';
import { GameResult } from '../result';
import { useLocalRecords } from '../kit';
import '../kit.css';
import { HanamiRules, HanamiTable } from './table';
// Vite provides the default URL export for this worker asset.
// oxlint-disable-next-line import/default
import hanamiWorkerUrl from '../hanami-worker.ts?worker&url';

const AI: Side = 1;
const ME: Side = 0;
type Settings = { level: HanamiLevel };
type Records = Partial<Record<HanamiLevel, { won: number; played: number }>>;
const isLevel = (v: unknown): v is HanamiLevel =>
  typeof v === 'number' && v in HANAMI_LEVELS;
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
      typeof rec?.won === 'number' &&
      typeof rec.played === 'number' &&
      Number.isSafeInteger(rec.won) &&
      Number.isSafeInteger(rec.played) &&
      rec.won >= 0 &&
      rec.played >= rec.won
    )
      out[lv] = { won: rec.won as number, played: rec.played as number };
  }
  return out;
}

/** Blank everything the AI must not know before it leaves this page. */
function shapeFor(s: HanamiState, side: Side): HanamiState {
  const opp = side === 0 ? 1 : 0;
  return {
    ...s,
    deck: s.deck.map(() => 0),
    removed: null,
    hands:
      side === 0
        ? [s.hands[0], s.hands[1].map(() => 0)]
        : [s.hands[0].map(() => 0), s.hands[1]],
    secret: opp === 0 ? [null, s.secret[1]] : [s.secret[0], null],
    discarded: opp === 0 ? [[], s.discarded[1]] : [s.discarded[0], []],
  };
}

function requestAi(
  state: HanamiState,
  level: HanamiLevel,
  resolve: (result: HanamiAiResult) => void,
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
    worker = new Worker(hanamiWorkerUrl, { type: 'module' });
    worker.onmessage = (e) => {
      if (!live || e.data?.id !== 1) return;
      if (e.data.error || !e.data.result?.move) {
        fail();
        return;
      }
      cancel();
      resolve(e.data.result);
    };
    worker.onerror = (e) => {
      e.preventDefault();
      fail();
    };
    worker.onmessageerror = fail;
    timeout = setTimeout(fail, 8000);
    worker.postMessage({
      id: 1,
      shape: shapeFor(state, AI),
      view: viewFor(state, AI),
      side: AI,
      level,
    });
  } catch {
    fail();
  }
  return cancel;
}

export function HanamiGame({ fromExplore = false }: { fromExplore?: boolean }) {
  const [storedSettings, saveSettings] = useLocalRecords(
    'tscjj:hanami-settings:v1',
    validateSettings,
    { level: 3 as HanamiLevel },
  );
  const [storedRecords, saveRecords] = useLocalRecords<Records>(
    'tscjj:hanami-records:v1',
    validateRecords,
    {},
  );
  const [sessionSettings, setSessionSettings] = useState<Settings | null>(null);
  const [sessionRecords, setSessionRecords] = useState<Records | null>(null);
  const settings = sessionSettings ?? storedSettings;
  const records = sessionRecords ?? storedRecords;
  const levelSelect = useRef<HTMLSelectElement>(null);
  const [matchId, setMatchId] = useState(0);
  const [aiError, setAiError] = useState(false);
  const [retry, setRetry] = useState(0);
  const saveLevel = (next: Settings) => {
    setSessionSettings(saveSettings(next) === 'unavailable' ? next : null);
  };
  const [game, setGame] = useState<{
    level: HanamiLevel;
    state: HanamiState;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const level = game?.level ?? settings.level;
  const state = game?.state ?? null;
  const aiTurn = !!state && decider(state) === AI;

  const commit = (next: HanamiState) => {
    setGame({ level, state: next });
    if (next.phase === 'over' && state?.phase !== 'over') {
      const cur = records[level] ?? { won: 0, played: 0 };
      const updated: Records = {
        ...records,
        [level]: {
          won: cur.won + (next.result?.winner === ME ? 1 : 0),
          played: cur.played + 1,
        },
      };
      setSessionRecords(
        saveRecords(updated) === 'unavailable' ? updated : null,
      );
    }
  };

  const commitAi = useEffectEvent(commit);
  useEffect(() => {
    if (!aiTurn || !state) return;
    const t0 = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fail = () => setAiError(true);
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
          fail();
        }
      },
      fail,
    );
    return () => {
      cancel();
      clearTimeout(timer);
    };
  }, [aiTurn, state, level, retry]);

  const start = () => {
    const shownLevel = Number(levelSelect.current?.value);
    const nextLevel = isLevel(shownLevel) ? shownLevel : settings.level;
    saveLevel({ level: nextLevel });
    setMatchId((id) => id + 1);
    setError(null);
    setAiError(false);
    setGame({
      level: nextLevel,
      state: newGame(Math.random, Math.random() < 0.5 ? 0 : 1),
    });
  };
  const onMove = (m: Move) => {
    if (!state || decider(state) !== ME) return false;
    try {
      setError(null);
      commit(apply(state, ME, m));
    } catch (e) {
      setError(e instanceof Error ? e.message : '出牌无效');
      return false;
    }
  };
  const stats = records[level];
  const view = state ? viewFor(state, ME) : null;
  const r = state?.result;
  return (
    <div className="kit hanami">
      <header className="kit-head">
        <div>
          <p className="kit-kicker">
            SEVEN SEATS · 对 AI · {HANAMI_LEVELS[level].name}
            {stats ? ` · 本档 ${stats.won} 胜 / ${stats.played} 局` : ''}
          </p>
          <h2 className="kit-sr">花街七席</h2>
        </div>
        <a
          className="hn-online-link"
          href={`/games/hanami/online${fromExplore ? '?from=explore' : ''}`}
        >
          和朋友联机 →
        </a>
      </header>
      <div className="kit-row">
        <select
          ref={levelSelect}
          aria-label="AI 难度（下局生效）"
          value={settings.level}
          onChange={(e) =>
            saveLevel({ level: Number(e.target.value) as HanamiLevel })
          }
        >
          {(Object.keys(HANAMI_LEVELS) as unknown as HanamiLevel[]).map((l) => (
            <option key={l} value={l}>
              {HANAMI_LEVELS[l].name}（{HANAMI_LEVELS[l].note}）
            </option>
          ))}
        </select>
        <button
          type="button"
          className={state ? undefined : 'kit-primary'}
          onClick={start}
        >
          {state ? '重新开局' : '开局'}
        </button>
      </div>
      {aiError && (
        <div className="kit-row">
          <output className="kit-brief kit-bad">
            AI 计算失败，请重试或重新开局。
          </output>
          <button
            type="button"
            onClick={() => {
              setAiError(false);
              setRetry((n) => n + 1);
            }}
          >
            重试 AI
          </button>
        </div>
      )}
      {error && <p className="kit-brief kit-bad">{error}</p>}
      {view ? (
        <HanamiTable
          key={matchId}
          v={view}
          names={['你', `AI · ${HANAMI_LEVELS[level].name.split(' · ')[1]}`]}
          onMove={onMove}
          thinking={
            aiTurn ? (aiError ? 'AI 计算失败，请重试' : 'AI 思考中…') : null
          }
          footer={
            state!.phase === 'round-end' ? (
              <div className="hn-next">
                <button
                  type="button"
                  className="kit-primary"
                  onClick={() => commit(nextRound(state!, Math.random))}
                >
                  下一轮（交换先手）
                </button>
              </div>
            ) : r ? (
              <GameResult
                tone={r.winner === ME ? 'win' : 'lose'}
                title={
                  r.winner === ME
                    ? '你赢了'
                    : r.winner === null
                      ? '平局'
                      : 'AI 赢了'
                }
                actions={[{ label: '再来一局', onClick: start, primary: true }]}
              >
                {r.reason === 'points'
                  ? '花签分值达到 11'
                  : r.reason === 'patrons'
                    ? '得到 4 位花客'
                    : '三轮后按分值决胜'}
                ：你 {r.patrons[ME]} 位 {r.points[ME]} 分，AI {r.patrons[AI]} 位{' '}
                {r.points[AI]} 分
              </GameResult>
            ) : null
          }
        />
      ) : (
        <div className="hn-intro">
          <p>
            七位花客，四种行动，每轮每种只能用一次。藏一张、舍两张、赠三张、比两组——把花客的青睐留在自己这边。
          </p>
          <button type="button" className="kit-primary" onClick={start}>
            开局
          </button>
        </div>
      )}
      <HanamiRules />
    </div>
  );
}
