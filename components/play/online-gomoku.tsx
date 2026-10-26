'use client';

import { Flag, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useRef } from 'react';
import '@/components/games/kit.css';
import { GomokuBoard } from '@/components/games/gomoku-board';
import {
  BLACK,
  EMPTY,
  WHITE,
  isForbidden,
  type GomokuState,
  type Stone,
} from '@/lib/games/gomoku';
import type { GomokuOnlineView } from '@/lib/multiplayer/gomoku-online';
import { Lobby } from './lobby';
import { useRoom } from './use-room';

const NAME = { [BLACK]: '黑', [WHITE]: '白' } as const;

export function GomokuOnline() {
  const [snap, client] = useRoom<GomokuOnlineView>();
  const color = useRef<HTMLSelectElement>(null);
  const renju = useRef<HTMLInputElement>(null);
  const v = snap.view;
  return (
    <div className="kit gomoku">
      <header className="kit-head">
        <div>
          <p className="kit-kicker">
            GOMOKU · 联机{v ? ` · ${v.renju ? '禁手规则' : '自由规则'}` : ''}
          </p>
          <h2 className="kit-sr">五子棋联机</h2>
        </div>
        <Link className="play-back" href="/games/gomoku">
          返回单机
        </Link>
      </header>
      <Lobby
        snap={snap}
        client={client}
        game="gomoku"
        options={{
          node: (
            <div className="kit-row">
              <label>
                我执
                <select ref={color} defaultValue="random" aria-label="执色">
                  <option value="random">随机</option>
                  <option value="black">黑（先手）</option>
                  <option value="white">白</option>
                </select>
              </label>
              <label className="kit-check">
                <input ref={renju} type="checkbox" aria-label="黑棋禁手" />{' '}
                黑棋禁手
              </label>
            </div>
          ),
          value: () => ({
            creator: color.current?.value ?? 'random',
            renju: renju.current?.checked ?? false,
          }),
        }}
      >
        {v && <Table v={v} seat={snap.seat} act={(a) => client.act(a)} />}
      </Lobby>
      <p className="kit-help">
        开一个房间，把邀请链接发给朋友，对方打开就入座，不需要注册；断线或刷新后会自动回到原来的座位。黑先，连成五子即胜。开启禁手后黑棋的三三、四四、长连判负（棋盘上以红叉提示）。悔棋需要对方同意，再来一局会交换黑白。
      </p>
    </div>
  );
}

function Table({
  v,
  seat,
  act,
}: {
  v: GomokuOnlineView;
  seat: number | null;
  act: (a: unknown) => void;
}) {
  const opp = seat === null ? null : 1 - seat;
  const over = v.winner !== null;
  const myTurn = v.started && !over && v.toPlay === v.you;
  const last = v.moves[v.moves.length - 1];
  const forbidden = useMemo(() => {
    const out = new Set<number>();
    if (!v.renju || !myTurn || v.you !== BLACK) return out;
    const s = {
      cells: v.cells as Stone[],
      size: v.size,
      renju: true,
    } as GomokuState;
    v.cells.forEach((c, i) => {
      if (c === EMPTY && isForbidden(s, i)) out.add(i);
    });
    return out;
  }, [v.cells, v.renju, v.size, v.you, myTurn]);
  const status = !v.started
    ? '等待对手入座…'
    : over
      ? '对局结束'
      : myTurn
        ? `轮到你（${NAME[v.you!]}）`
        : `等对方落子（${NAME[v.toPlay]}）`;
  return (
    <>
      <p className="kit-stats">
        <span>
          你执 <strong>{v.you ? NAME[v.you] : '—'}</strong>
        </span>
        <span>
          手数 <strong>{v.moves.length}</strong>
        </span>
        {seat !== null && opp !== null && (
          <span>
            比分 <strong>{v.score[seat]}</strong> :{' '}
            <strong>{v.score[opp]}</strong>
          </span>
        )}
        <span aria-live="polite">{status}</span>
      </p>
      {v.undoFrom !== null && v.undoFrom === opp && (
        <div className="play-ask" role="alert">
          对方请求悔棋。
          <button
            type="button"
            className="kit-primary"
            onClick={() => act({ type: 'undo-answer', accept: true })}
          >
            同意
          </button>
          <button
            type="button"
            onClick={() => act({ type: 'undo-answer', accept: false })}
          >
            拒绝
          </button>
        </div>
      )}
      {v.undoFrom !== null && v.undoFrom === seat && (
        <p className="kit-help">已请求悔棋，等待对方答复…</p>
      )}
      {over && (
        <output
          className={`play-result ${v.winner === v.you ? 'kit-ok' : v.winner ? 'kit-bad' : ''}`}
        >
          <strong>
            {v.winner === 0
              ? '和棋'
              : v.winner === v.you
                ? '你赢了'
                : v.you
                  ? '你输了'
                  : `${NAME[v.winner!]}胜`}
          </strong>
          <span>
            {v.reason === 'resign'
              ? '对方认输'
              : v.reason === 'forbidden'
                ? '黑棋落在禁手点'
                : v.reason === 'five'
                  ? `${NAME[v.winner as 1 | 2]}连成五子`
                  : '棋盘下满'}
            {opp !== null && v.rematch[opp] && ' · 对方想再来一局'}
          </span>
          <button
            type="button"
            className="kit-primary"
            disabled={seat !== null && v.rematch[seat]}
            onClick={() => act({ type: 'rematch' })}
          >
            {seat !== null && v.rematch[seat]
              ? '等对方同意…'
              : '再来一局（交换黑白）'}
          </button>
        </output>
      )}
      <GomokuBoard
        cells={v.cells}
        size={v.size}
        last={last}
        line={v.line}
        forbidden={forbidden}
        disabled={!myTurn}
        onPlay={(p) => act({ type: 'move', p })}
        label="五子棋联机棋盘"
      />
      <div className="kit-row" role="toolbar" aria-label="对局操作">
        <button
          type="button"
          data-shortcut="z"
          disabled={
            over || !v.started || v.undoFrom !== null || !v.moves.length
          }
          onClick={() => act({ type: 'undo-request' })}
        >
          <Undo2 size={15} aria-hidden="true" /> 请求悔棋
        </button>
        <button
          type="button"
          disabled={over || !v.started}
          onClick={() => {
            if (confirm('确定认输吗？')) act({ type: 'resign' });
          }}
        >
          <Flag size={15} aria-hidden="true" /> 认输
        </button>
      </div>
    </>
  );
}
