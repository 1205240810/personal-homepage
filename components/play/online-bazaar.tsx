'use client';

/* oxlint-disable next/no-html-link-for-pages */

import '@/components/games/kit.css';
import { GameResult } from '@/components/games/result';
import { BazaarTable } from '@/components/games/bazaar/table';
import { describeMove, roundSummary } from '@/components/games/bazaar/text';
import type { BazaarView, Move, Side } from '@/lib/games/bazaar';
import type { BazaarOnlineView } from '@/lib/multiplayer/bazaar-online';
import { Lobby } from './lobby';
import { useRoom } from './use-room';

export function BazaarOnline({
  fromExplore = false,
}: {
  fromExplore?: boolean;
}) {
  const [snap, client] = useRoom<BazaarOnlineView>('bazaar');
  const v = snap.view;
  return (
    <div className="kit bazaar">
      <header className="kit-head">
        <div>
          <p className="kit-kicker">ZAYTON BAZAAR · 联机 1 对 1</p>
          <h2 className="kit-sr">刺桐市集联机</h2>
        </div>
        <a
          className="bz-online-link"
          href={`/games/bazaar${fromExplore ? '?from=explore' : ''}`}
        >
          返回单机
        </a>
      </header>
      <Lobby
        snap={snap}
        client={client}
        game="bazaar"
        createLabel="开一局刺桐市集"
      >
        {v && (
          <Table
            v={v}
            seat={snap.seat}
            connected={snap.status === 'open'}
            names={snap.seats.map((s) => s.name)}
            act={(a) =>
              client.act({ ...a, positionRevision: v.positionRevision })
            }
          />
        )}
      </Lobby>
      <p className="kit-help">
        开一个房间，把邀请链接发给朋友，对方打开就入座；断线或刷新会自动回到座位。服务器洗牌发牌，对手的货和赏银面值不会发到你的浏览器。
      </p>
    </div>
  );
}

function Table({
  v,
  seat,
  connected,
  names,
  act,
}: {
  v: BazaarOnlineView;
  seat: number | null;
  connected: boolean;
  names: string[];
  act: (a: Record<string, unknown>) => void;
}) {
  if (!v.started || v.phase === 'waiting')
    return <p className="kit-help">等待对手入座…双方到齐后自动开局。</p>;
  const bv = v as BazaarView & BazaarOnlineView;
  const me = (seat ?? 0) as Side;
  const opp = (1 - me) as Side;
  const canAct = connected && seat !== null;
  const myTurn = canAct && bv.phase === 'play' && bv.toPlay === me;
  const label = (i: number) =>
    `${names[i] || `玩家 ${i + 1}`}${i === seat ? '（你）' : ''}`;
  const lastOpp = bv.last?.side === opp ? describeMove(bv.last.move) : null;
  return (
    <BazaarTable
      positionKey={`${bv.positionRevision}:${connected}:${seat}`}
      v={bv}
      disabled={!myTurn}
      names={[label(0), label(1)]}
      onMove={(m: Move) => {
        if (myTurn) act({ type: 'move', move: m });
        // Server rejections do not change the revision; keep the choice retryable.
        return false;
      }}
      status={
        !connected
          ? '连接恢复后可继续操作…'
          : myTurn
            ? `${lastOpp ? `对方${lastOpp}。` : ''}轮到你：选货后点动作`
            : bv.phase === 'play'
              ? '等对方行动…'
              : null
      }
      footer={
        <>
          <p className="kit-help" style={{ textAlign: 'center' }}>
            第 {bv.round} 局 · 场次比分 {v.score[me]} : {v.score[opp]}
          </p>
          {bv.phase === 'round-end' && bv.roundResult && (
            <div className="kit-row bz-actions">
              <span>{roundSummary(bv.roundResult, me, ['你', '对方'])}</span>
              <button
                type="button"
                className="kit-primary"
                disabled={!canAct || v.ready[me]}
                onClick={() => act({ type: 'next' })}
              >
                {v.ready[me] ? '等对方…' : '下一局（输家先手）'}
              </button>
            </div>
          )}
          {bv.phase === 'over' && bv.roundResult && (
            <GameResult
              tone={bv.winner === me ? 'win' : 'lose'}
              title={
                bv.winner === me ? '你赢下两枚市舶印' : '对方赢下两枚市舶印'
              }
              actions={
                canAct && !v.ready[me]
                  ? [
                      {
                        label: '再来一场',
                        primary: true,
                        onClick: () => act({ type: 'rematch' }),
                      },
                    ]
                  : []
              }
            >
              {roundSummary(bv.roundResult, me, ['你', '对方'])}
              {v.ready[me] ? ' · 已准备，等待对方…' : ''}
              {v.ready[opp] && !v.ready[me] ? ' · 对方想再来一场' : ''}
            </GameResult>
          )}
        </>
      }
    />
  );
}
