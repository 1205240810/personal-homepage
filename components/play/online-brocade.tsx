'use client';

/* oxlint-disable next/no-html-link-for-pages */

import { useState } from 'react';
import '@/components/games/kit.css';
import { GameResult } from '@/components/games/result';
import { BrocadeTable } from '@/components/games/brocade/table';
import { describeMove, finalText } from '@/components/games/brocade/text';
import type { BrocadeView, Move, Side } from '@/lib/games/brocade';
import type { BrocadeOnlineView } from '@/lib/multiplayer/brocade-online';
import { Lobby } from './lobby';
import { useRoom } from './use-room';

export function BrocadeOnline({
  fromExplore = false,
}: {
  fromExplore?: boolean;
}) {
  const [snap, client] = useRoom<BrocadeOnlineView>('brocade');
  const v = snap.view;
  return (
    <div className="kit brocade">
      <header className="kit-head">
        <div>
          <p className="kit-kicker">BROCADE GUILD · 联机 1 对 1</p>
          <h2 className="kit-sr">锦绣织造联机</h2>
        </div>
        <a
          className="bc-online-link"
          href={`/games/brocade${fromExplore ? '?from=explore' : ''}`}
        >
          返回单机
        </a>
      </header>
      <Lobby
        snap={snap}
        client={client}
        game="brocade"
        createLabel="开一局锦绣织造"
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
        开一个房间，把邀请链接发给朋友，对方打开就入座；断线或刷新会自动回到座位。服务器校验每一步并负责洗牌与补牌，暗订的织品不会泄露给对方。
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
  v: BrocadeOnlineView;
  seat: number | null;
  connected: boolean;
  error: string | null;
  names: string[];
  act: (a: Record<string, unknown>) => void;
}) {
  const [retry, setRetry] = useState({ error, epoch: 0 });
  let errorEpoch = retry.epoch;
  if (retry.error !== error) {
    if (error) errorEpoch++;
    setRetry({ error, epoch: errorEpoch });
  }
  if (!v.started || v.phase === 'waiting')
    return <p className="kit-help">等待对手入座…双方到齐后自动开局。</p>;
  const gv = v as BrocadeView & BrocadeOnlineView;
  const me = (seat ?? 0) as Side;
  const opp = (1 - me) as Side;
  const canAct = connected && seat !== null;
  const myTurn = canAct && gv.phase === 'play' && gv.toPlay === me;
  const label = (i: number) =>
    `${names[i] || `玩家 ${i + 1}`}${i === seat ? '（你）' : ''}`;
  const lastOpp =
    gv.last?.side === opp ? describeMove(gv.last.move, gv.last.noble) : null;
  return (
    <BrocadeTable
      v={gv}
      positionKey={`${v.positionRevision}:${connected}:${errorEpoch}`}
      disabled={!myTurn}
      names={[label(0), label(1)]}
      onMove={(m: Move) => act({ type: 'move', move: m })}
      status={
        !connected
          ? '连接恢复后可继续操作…'
          : myTurn
            ? `${lastOpp ? `对方${lastOpp}。` : ''}轮到你：取丝线、预订或购入织品`
            : gv.phase === 'play'
              ? '等对方行动…'
              : null
      }
      footer={
        <>
          <p className="kit-help" style={{ textAlign: 'center' }}>
            场次比分 {v.score[me]} : {v.score[opp]}
          </p>
          {gv.phase === 'over' && (
            <GameResult
              tone={gv.winner === me ? 'win' : 'lose'}
              title={
                gv.winner === me
                  ? '你赢了'
                  : gv.winner === 'draw'
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
              {finalText(gv, me, ['你', '对方'])}
              {v.ready[me] ? ' · 已准备，等待对方…' : ''}
              {v.ready[opp] && !v.ready[me] ? ' · 对方想再来一局' : ''}
            </GameResult>
          )}
        </>
      }
    />
  );
}
