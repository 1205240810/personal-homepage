'use client';

/* oxlint-disable next/no-html-link-for-pages */

import { Flag } from 'lucide-react';
import { useRef, useState } from 'react';
import '@/components/games/kit.css';
import {
  QuoridorBoard,
  type BoardMode,
} from '@/components/games/quoridor-board';
import {
  ModeSwitch,
  QuoridorPlayers,
  QD_NAME,
} from '@/components/games/quoridor';
import { GameResult } from '@/components/games/result';
import type { QuoridorOnlineView } from '@/lib/multiplayer/quoridor-online';
import { Lobby } from './lobby';
import { useRoom } from './use-room';

export function QuoridorOnline({
  fromExplore = false,
}: {
  fromExplore?: boolean;
}) {
  const [snap, client] = useRoom<QuoridorOnlineView>('quoridor');
  const order = useRef<HTMLSelectElement>(null);
  const v = snap.view;
  return (
    <div className="kit quoridor">
      <header className="kit-head">
        <div>
          <p className="kit-kicker">QUORIDOR · 联机 1 对 1</p>
          <h2 className="kit-sr">步步为营联机</h2>
        </div>
        <a
          className="play-back"
          href={`/games/quoridor${fromExplore ? '?from=explore' : ''}`}
        >
          返回单机
        </a>
      </header>
      <Lobby
        snap={snap}
        client={client}
        game="quoridor"
        createLabel="开一局步步为营"
        options={{
          node: (
            <div className="kit-row">
              <label>
                我执
                <select ref={order} defaultValue="random" aria-label="先后手">
                  <option value="random">随机</option>
                  <option value="first">朱（先手）</option>
                  <option value="second">黛（后手）</option>
                </select>
              </label>
            </div>
          ),
          value: () => ({ creator: order.current?.value ?? 'random' }),
        }}
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
        开一个房间，把邀请链接发给朋友，对方打开就入座；断线或刷新会自动回到座位。服务器检查每一步：放墙不能把任何一方完全堵死。再来一局交换先后手。
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
  v: QuoridorOnlineView;
  seat: number | null;
  connected: boolean;
  names: string[];
  act: (a: Record<string, unknown>) => void;
}) {
  const [mode, setMode] = useState<BoardMode>('move');
  const [rev, setRev] = useState(v.positionRevision);
  if (rev !== v.positionRevision) {
    setRev(v.positionRevision);
    setMode('move');
  }
  const g = v.game;
  const canAct = connected && seat !== null;
  const over = g.winner !== null;
  const myTurn = canAct && v.started && !over && g.toPlay === v.you;
  const opp = seat === null ? null : 1 - seat;
  const label = (side: 0 | 1) => {
    const s = v.sides[0] === side ? 0 : 1;
    const n = names[s] || `玩家 ${s + 1}`;
    return `${n}${s === seat ? '（你）' : ''} · ${QD_NAME[side]}`;
  };
  return (
    <>
      <QuoridorPlayers state={g} names={[label(0), label(1)]} />
      <div className="kit-row">
        <ModeSwitch
          mode={mode}
          setMode={setMode}
          disabled={!myTurn}
          wallsLeft={v.you === null ? 0 : g.left[v.you]}
        />
        <button
          type="button"
          disabled={!canAct || over || !v.started}
          onClick={() => {
            if (confirm('确定认输吗？')) act({ type: 'resign' });
          }}
        >
          <Flag size={15} aria-hidden="true" /> 认输
        </button>
        <span className="kit-stats">
          <output aria-live="polite">
            {!connected
              ? '连接恢复后可继续操作…'
              : !v.started
                ? '等待对手入座…'
                : over
                  ? '对局结束'
                  : myTurn
                    ? '轮到你'
                    : '等对方行动'}
          </output>
          {seat !== null && opp !== null && (
            <span>
              比分 {v.score[seat]} : {v.score[opp]}
            </span>
          )}
          <span>第 {g.history.length} 手</span>
        </span>
      </div>
      {over && (
        <GameResult
          tone={g.winner === v.you ? 'win' : 'lose'}
          title={
            g.winner === v.you
              ? '你赢了'
              : v.you === null
                ? `${QD_NAME[g.winner!]}方获胜`
                : '对方赢了'
          }
          actions={
            canAct && seat !== null && !v.rematch[seat]
              ? [
                  {
                    label: '再来一局（交换先后）',
                    primary: true,
                    onClick: () => act({ type: 'rematch' }),
                  },
                ]
              : []
          }
        >
          {g.reason === 'resign' ? '有一方认输' : '率先抵达对岸'}
          {seat !== null && v.rematch[seat] ? ' · 等对方同意…' : ''}
          {opp !== null && v.rematch[opp] ? ' · 对方想再来一局' : ''}
        </GameResult>
      )}
      <QuoridorBoard
        state={g}
        mode={mode}
        disabled={!myTurn}
        you={v.you}
        onMove={(m) => act({ type: 'move', move: m })}
        label="步步为营联机棋盘"
      />
    </>
  );
}
