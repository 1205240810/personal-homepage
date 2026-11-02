'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
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
import { HanamiTable } from './table';
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
      Number.isSafeInteger(rec?.won) &&
      Number.isSafeInteger(rec?.played)
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

function useAi() {
  const worker = useRef<Worker | null>(null);
  const seq = useRef(0);
  useEffect(() => () => worker.current?.terminate(), []);
  return (s: HanamiState, level: HanamiLevel) =>
    new Promise<HanamiAiResult>((resolve, reject) => {
      worker.current ??= new Worker(hanamiWorkerUrl, { type: 'module' });
      const id = ++seq.current;
      worker.current.onmessage = (e) => {
        if (e.data.id !== id) return;
        if (e.data.error) reject(new Error(e.data.error));
        else resolve(e.data.result);
      };
      worker.current.postMessage({
        id,
        shape: shapeFor(s, AI),
        view: viewFor(s, AI),
        side: AI,
        level,
      });
    });
}

export function HanamiGame() {
  const [settings, saveSettings] = useLocalRecords(
    'tscjj:hanami-settings:v1',
    validateSettings,
    { level: 3 as HanamiLevel },
  );
  const [records, saveRecords] = useLocalRecords(
    'tscjj:hanami-records:v1',
    validateRecords,
    {},
  );
  const [game, setGame] = useState<{
    level: HanamiLevel;
    state: HanamiState;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ai = useAi();
  const level = game?.level ?? settings.level;
  const state = game?.state ?? null;
  const aiTurn = !!state && decider(state) === AI;

  const commit = (next: HanamiState) => {
    setGame({ level, state: next });
    if (next.phase === 'over' && state?.phase !== 'over') {
      const cur = records[level] ?? { won: 0, played: 0 };
      saveRecords({
        ...records,
        [level]: {
          won: cur.won + (next.result?.winner === ME ? 1 : 0),
          played: cur.played + 1,
        },
      });
    }
  };

  useEffect(() => {
    if (!aiTurn || !state) return;
    let live = true;
    const t0 = Date.now();
    void ai(state, level).then(async (r) => {
      const wait = 600 - (Date.now() - t0);
      if (wait > 0) await new Promise((res) => setTimeout(res, wait));
      if (live) commit(apply(state, AI, r.move));
    });
    return () => {
      live = false;
    };
  });

  const start = () => {
    setError(null);
    setGame({
      level: settings.level,
      state: newGame(Math.random, Math.random() < 0.5 ? 0 : 1),
    });
  };
  const onMove = (m: Move) => {
    if (!state) return;
    try {
      setError(null);
      commit(apply(state, ME, m));
    } catch (e) {
      setError(e instanceof Error ? e.message : '出牌无效');
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
        <Link className="hn-online-link" href="/games/hanami/online">
          和朋友联机 →
        </Link>
      </header>
      <div className="kit-row">
        <select
          aria-label="AI 难度（下局生效）"
          value={settings.level}
          onChange={(e) =>
            saveSettings({ level: Number(e.target.value) as HanamiLevel })
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
      {error && <p className="kit-brief kit-bad">{error}</p>}
      {view ? (
        <HanamiTable
          v={view}
          names={['你', `AI · ${HANAMI_LEVELS[level].name.split(' · ')[1]}`]}
          onMove={onMove}
          thinking={aiTurn ? 'AI 思考中…' : null}
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
    </div>
  );
}
