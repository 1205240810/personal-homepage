'use client';

/* oxlint-disable next/no-html-link-for-pages */

import { Flag, Swords } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import '@/components/games/kit.css';
import { JunqiBoard } from '@/components/games/junqi-board';
import {
  DeployTools,
  JunqiPlayers,
  JunqiReport,
  describeEvent,
  resultText,
  swapLayout,
} from '@/components/games/junqi';
import { GameResult } from '@/components/games/result';
import { checkLayout, type Layout, type Side } from '@/lib/games/junqi';
import { PRESETS } from '@/lib/games/junqi-layouts';
import type { JunqiOnlineView } from '@/lib/multiplayer/junqi-online';
import { Lobby } from './lobby';
import { useRoom } from './use-room';

export function JunqiOnline({
  fromExplore = false,
}: {
  fromExplore?: boolean;
}) {
  const [snap, client] = useRoom<JunqiOnlineView>('junqi');
  const order = useRef<HTMLSelectElement>(null);
  const mode = useRef<HTMLSelectElement>(null);
  const v = snap.view;
  return (
    <div className="kit junqi">
      <header className="kit-head">
        <div>
          <p className="kit-kicker">
            军棋 · 联机 1 对 1{v ? ` · ${v.open ? '明棋' : '暗棋'}` : ''}
          </p>
          <h2 className="kit-sr">军棋联机</h2>
        </div>
        <a
          className="play-back"
          href={`/games/junqi${fromExplore ? '?from=explore' : ''}`}
        >
          返回单机
        </a>
      </header>
      <Lobby
        snap={snap}
        client={client}
        game="junqi"
        createLabel="开一局军棋"
        options={{
          node: (
            <div className="kit-row">
              <label>
                我执
                <select ref={order} defaultValue="random" aria-label="先后手">
                  <option value="random">随机</option>
                  <option value="first">红（先走）</option>
                  <option value="second">蓝（后走）</option>
                </select>
              </label>
              <label>
                玩法
                <select
                  ref={mode}
                  defaultValue="hidden"
                  aria-label="暗棋或明棋"
                >
                  <option value="hidden">暗棋（裁判判子）</option>
                  <option value="open">明棋（全部亮出）</option>
                </select>
              </label>
            </div>
          ),
          value: () => ({
            creator: order.current?.value ?? 'random',
            open: mode.current?.value === 'open',
          }),
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
        开一个房间，把邀请链接发给朋友，对方打开就入座；断线或刷新会自动回到座位。双方各自布阵后开战，真实阵型只保存在服务器上：它当裁判，只告诉你每次交战的胜负。再来一局交换红蓝。
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
  v: JunqiOnlineView;
  seat: number | null;
  connected: boolean;
  names: string[];
  act: (a: Record<string, unknown>) => void;
}) {
  const g = v.game;
  const viewer: Side = v.you ?? 0;
  const [layout, setLayout] = useState<Layout>(() => PRESETS[0].layout.slice());
  const canAct = connected && seat !== null && v.you !== null;
  const over = g.phase === 'over';
  const deploying = g.phase === 'deploy' && v.started;
  const myReady = v.you !== null && g.ready[v.you];
  const myTurn = canAct && g.phase === 'play' && g.toPlay === v.you;
  const opp = seat === null ? null : 1 - seat;
  const label = (side: Side) => {
    const s = v.sides[0] === side ? 0 : 1;
    const n = names[s] || `玩家 ${s + 1}`;
    return `${n}${s === seat ? '（你）' : ''} · ${side ? '蓝' : '红'}`;
  };
  const bad = useMemo(() => checkLayout(layout), [layout]);
  const last = g.log.at(-1);
  const status = !connected
    ? '连接恢复后可继续操作…'
    : !v.started
      ? '等待对手入座…'
      : deploying
        ? myReady
          ? '你已布好阵，等对方布阵…'
          : g.ready[(1 - viewer) as Side]
            ? '对方已布好阵，排好后点「布阵完成」'
            : '布阵：点两枚棋子互换，或拖动交换'
        : over
          ? '对局结束'
          : `${myTurn ? '轮到你' : '等对方行动'}${last ? ` · ${describeEvent(last, viewer)}` : ''}`;
  return (
    <div className="jq-layout">
      <div className="jq-top">
        {deploying && !myReady && canAct && (
          <DeployTools layout={layout} setLayout={setLayout}>
            <button
              type="button"
              className="kit-primary"
              data-shortcut="k"
              disabled={bad.errors.length > 0}
              onClick={() => act({ type: 'deploy', layout })}
            >
              <Swords size={15} aria-hidden="true" /> 布阵完成
            </button>
          </DeployTools>
        )}
        {!deploying && (
          <div className="kit-row">
            <button
              type="button"
              disabled={!canAct || g.phase !== 'play'}
              onClick={() => {
                if (confirm('确定认输吗？')) act({ type: 'resign' });
              }}
            >
              <Flag size={15} aria-hidden="true" /> 认输
            </button>
            <span className="kit-stats">
              {seat !== null && opp !== null && (
                <span>
                  比分 {v.score[seat]} : {v.score[opp]}
                </span>
              )}
              <span>第 {g.ply} 步</span>
            </span>
          </div>
        )}
        <JunqiPlayers view={g} names={[label(0), label(1)]} viewer={viewer} />
        <p className="kit-brief">
          <output aria-live="polite">{status}</output>
        </p>
        {over && (
          <GameResult
            tone={g.winner !== null && g.winner === v.you ? 'win' : 'lose'}
            title={
              g.winner === null
                ? '和棋'
                : g.winner === v.you
                  ? '你赢了'
                  : v.you === null
                    ? `${g.winner ? '蓝' : '红'}方获胜`
                    : '对方赢了'
            }
            actions={
              canAct && seat !== null && !v.rematch[seat]
                ? [
                    {
                      label: '再来一局（交换红蓝）',
                      primary: true,
                      onClick: () => act({ type: 'rematch' }),
                    },
                  ]
                : []
            }
          >
            {resultText(g, v.you)}
            {seat !== null && v.rematch[seat] ? ' · 等对方同意…' : ''}
            {opp !== null && v.rematch[opp] ? ' · 对方想再来一局' : ''}
          </GameResult>
        )}
      </div>
      <div className="jq-stage">
        <JunqiBoard
          view={g}
          viewer={viewer}
          live={deploying ? canAct && !myReady : myTurn}
          onMove={(m) => act({ type: 'move', move: m })}
          deploy={
            deploying && !myReady
              ? {
                  layout,
                  bad: bad.cells,
                  onSwap: (a, b) => setLayout(swapLayout(layout, a, b)),
                }
              : undefined
          }
          label="军棋联机棋盘"
        />
      </div>
      <div className="jq-bottom">
        {g.phase !== 'deploy' && <JunqiReport view={g} viewer={viewer} />}
      </div>
    </div>
  );
}
