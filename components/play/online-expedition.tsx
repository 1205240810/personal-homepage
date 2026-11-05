'use client';

/* oxlint-disable next/no-html-link-for-pages */

import { useRef, useState } from 'react';
import '@/components/games/kit.css';
import { GameResult } from '@/components/games/result';
import { ExpeditionTable } from '@/components/games/expedition/table';
import type { ExpeditionView, Move, Side } from '@/lib/games/expedition';
import type { ExpeditionOnlineView } from '@/lib/multiplayer/expedition-online';
import { Lobby } from './lobby';
import { useRoom } from './use-room';

export function ExpeditionOnline({
  fromExplore = false,
}: {
  fromExplore?: boolean;
}) {
  const [snap, client] = useRoom<ExpeditionOnlineView>('expedition');
  const rounds = useRef<HTMLSelectElement>(null);
  const v = snap.view;
  return (
    <div className="kit expedition">
      <header className="kit-head">
        <div>
          <p className="kit-kicker">SILK ROAD · 联机 1 对 1</p>
          <h2 className="kit-sr">丝路远行联机</h2>
        </div>
        <a
          className="ex-online-link"
          href={`/games/expedition${fromExplore ? '?from=explore' : ''}`}
        >
          返回单机
        </a>
      </header>
      <Lobby
        snap={snap}
        client={client}
        game="expedition"
        createLabel="开一局丝路远行"
        options={{
          node: (
            <div className="kit-row">
              <label>
                轮数
                <select ref={rounds} defaultValue="3" aria-label="轮数">
                  <option value="3">三轮累计</option>
                  <option value="1">单轮快局</option>
                </select>
              </label>
            </div>
          ),
          value: () => ({
            rounds: Number(rounds.current?.value ?? 3) === 1 ? 1 : 3,
          }),
        }}
      >
        {v && (
          <Table
            v={v}
            seat={snap.seat}
            connected={snap.status === 'open'}
            error={snap.error}
            names={snap.seats.map((s) => s.name)}
            act={(a) =>
              client.act({ ...a, positionRevision: v.positionRevision })
            }
          />
        )}
      </Lobby>
      <p className="kit-help">
        开一个房间，把邀请链接发给朋友，对方打开就入座；断线或刷新会自动回到座位。服务器洗牌发牌，对手的手牌和牌堆顺序不会发到你的浏览器。
      </p>
    </div>
  );
}

function Table({
  v,
  seat,
  connected,
  error,
  names,
  act,
}: {
  v: ExpeditionOnlineView;
  seat: number | null;
  connected: boolean;
  error: string | null;
  names: string[];
  act: (a: Record<string, unknown>) => void;
}) {
  const [response, setResponse] = useState({ error, retry: 0 });
  let retry = response.retry;
  if (response.error !== error) {
    // Only a new rejection releases a submitted move. act() clearing the
    // previous error belongs to the new request, which must remain locked.
    if (error !== null) retry++;
    setResponse({ error, retry });
  }
  if (!v.started || v.phase === 'waiting')
    return (
      <p className="kit-help">等待对手入座…牌局会在双方到齐后自动开始。</p>
    );
  const ev = v as ExpeditionView & ExpeditionOnlineView;
  const me = (seat ?? 0) as Side;
  const opp = (1 - me) as Side;
  const canAct = connected && seat !== null;
  const myTurn =
    canAct && ev.toPlay === me && (ev.phase === 'play' || ev.phase === 'draw');
  const last = ev.roundScores[ev.roundScores.length - 1];
  const label = (i: number) =>
    `${names[i] || `玩家 ${i + 1}`}${i === seat ? '（你）' : ''}`;
  return (
    <ExpeditionTable
      positionKey={`${ev.positionRevision}:${connected}:${seat}:${retry}`}
      v={ev}
      disabled={!myTurn}
      names={[label(0), label(1)]}
      onMove={(m: Move) => {
        if (!myTurn) return false;
        act({ type: 'move', move: m });
        return true;
      }}
      status={
        !connected
          ? '连接恢复后可继续操作…'
          : myTurn
            ? ev.phase === 'play'
              ? '轮到你：选一张手牌，出到商路或弃到驿站'
              : '再摸一张：点牌堆，或点亮起的驿站'
            : ev.phase === 'play' || ev.phase === 'draw'
              ? '等对方行动…'
              : null
      }
      footer={
        <>
          <p className="kit-help" style={{ textAlign: 'center' }}>
            第 {ev.round} / {ev.rounds} 轮 · 比分 {v.score[me]} : {v.score[opp]}
          </p>
          {ev.phase === 'round-end' && last && (
            <div className="kit-row ex-actions">
              <span>
                本轮 你 {last[me]}，对方 {last[opp]}（累计 {ev.totals[me]} :{' '}
                {ev.totals[opp]}）
              </span>
              <button
                type="button"
                className="kit-primary"
                disabled={!canAct || v.ready[me]}
                onClick={() => act({ type: 'next' })}
              >
                {v.ready[me] ? '等对方…' : '下一轮（交换先手）'}
              </button>
            </div>
          )}
          {ev.phase === 'over' && (
            <GameResult
              tone={ev.winner === me ? 'win' : 'lose'}
              title={
                ev.winner === me
                  ? '你赢了'
                  : ev.winner === 'draw'
                    ? '平局'
                    : '对方赢了'
              }
              actions={
                canAct && !v.ready[me]
                  ? [
                      {
                        label: '再来一局',
                        primary: true,
                        onClick: () => act({ type: 'rematch' }),
                      },
                    ]
                  : []
              }
            >
              累计：你 {ev.totals[me]}，对方 {ev.totals[opp]}
              {v.ready[me] ? ' · 已准备，等待对方…' : ''}
              {v.ready[opp] && !v.ready[me] ? ' · 对方想再来一局' : ''}
            </GameResult>
          )}
        </>
      }
    />
  );
}
