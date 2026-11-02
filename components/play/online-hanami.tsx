'use client';

import '@/components/games/kit.css';
import { GameResult } from '@/components/games/result';
import { HanamiTable } from '@/components/games/hanami/table';
import type { Move, Side } from '@/lib/games/hanami';
import type { HanamiOnlineView } from '@/lib/multiplayer/hanami-online';
import { Lobby } from './lobby';
import { useRoom } from './use-room';

export function HanamiOnline({
  fromExplore = false,
}: {
  fromExplore?: boolean;
}) {
  const [snap, client] = useRoom<HanamiOnlineView>('hanami');
  const v = snap.view;
  return (
    <div className="kit hanami">
      <header className="kit-head">
        <div>
          <p className="kit-kicker">SEVEN SEATS · 联机 1 对 1</p>
          <h2 className="kit-sr">花街七席联机</h2>
        </div>
        <a
          className="hn-online-link"
          href={`/games/hanami${fromExplore ? '?from=explore' : ''}`}
        >
          返回单机
        </a>
      </header>
      <Lobby
        snap={snap}
        client={client}
        game="hanami"
        createLabel="开一桌花街七席"
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
  v: HanamiOnlineView;
  seat: number | null;
  connected: boolean;
  names: string[];
  act: (a: Record<string, unknown>) => void;
}) {
  if (!v.started || !v.round)
    return (
      <p className="kit-help">等待对手入座…牌局会在双方到齐后自动开始。</p>
    );
  const me = (seat ?? 0) as Side;
  const opp = (1 - me) as Side;
  const r = v.result;
  const canAct = connected && seat !== null;
  return (
    <HanamiTable
      key={`${v.positionRevision}:${connected}`}
      v={v}
      disabled={!canAct}
      names={
        [names[0] || '玩家 1', names[1] || '玩家 2'].map((n, i) =>
          i === me ? `${n}（你）` : n,
        ) as [string, string]
      }
      onMove={(m: Move) => {
        if (canAct) act({ type: 'move', move: m });
        // The relay acknowledges asynchronously; its revision guard rejects
        // replays. Do not keep the shared table's synchronous submission lock.
        return false;
      }}
      footer={
        <>
          {!connected && <p className="kit-help">连接恢复后可继续操作…</p>}
          <p className="hn-score kit-help">
            比分 {v.score[me]} : {v.score[opp]}
          </p>
          {v.phase === 'round-end' && (
            <div className="hn-next">
              <button
                type="button"
                className="kit-primary"
                disabled={!canAct || v.ready[me]}
                onClick={() => act({ type: 'next' })}
              >
                {v.ready[me] ? '等对方…' : '下一轮（交换先手）'}
              </button>
              {v.ready[opp] && !v.ready[me] && (
                <span className="kit-help">对方已准备</span>
              )}
            </div>
          )}
          {r && (
            <GameResult
              tone={r.winner === me ? 'win' : 'lose'}
              title={
                r.winner === me
                  ? '你赢了'
                  : r.winner === null
                    ? '平局'
                    : '对方赢了'
              }
              actions={
                canAct && !v.ready[me]
                  ? [
                      {
                        label: '再来一局',
                        onClick: () => act({ type: 'rematch' }),
                        primary: true,
                      },
                    ]
                  : []
              }
            >
              {r.reason === 'points'
                ? '花签分值达到 11'
                : r.reason === 'patrons'
                  ? '得到 4 位花客'
                  : '三轮后按分值决胜'}
              ：你 {r.patrons[me]} 位 {r.points[me]} 分，对方 {r.patrons[opp]}{' '}
              位 {r.points[opp]} 分{v.ready[me] && ' · 已准备，等待对方…'}
              {v.ready[opp] && !v.ready[me] ? ' · 对方想再来一局' : ''}
            </GameResult>
          )}
        </>
      }
    />
  );
}
