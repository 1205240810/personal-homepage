'use client';

import { Flag, Hand, Undo2 } from 'lucide-react';
import { useRef } from 'react';
import '@/components/games/kit.css';
import '@/components/games/go.css';
import { BLACK, WHITE, coordName } from '@/lib/games/go';
import type { GoOnlineView } from '@/lib/multiplayer/go-online';
import { Lobby } from './lobby';
import { useRoom } from './use-room';

const NAME = { [BLACK]: '黑', [WHITE]: '白' } as const;

function starPoints(n: number) {
  const e = n >= 13 ? 3 : 2;
  const mid = (n - 1) >> 1;
  const xs = n >= 13 ? [e, mid, n - 1 - e] : [e, n - 1 - e];
  const s = new Set<number>();
  for (const x of xs) for (const y of xs) s.add(y * n + x);
  if (n === 9) s.add(mid * n + mid);
  return s;
}

export function GoOnline() {
  const [snap, client] = useRoom<GoOnlineView>();
  const size = useRef<HTMLSelectElement>(null);
  const color = useRef<HTMLSelectElement>(null);
  const handicap = useRef<HTMLSelectElement>(null);
  const v = snap.view;

  return (
    <div className="kit go-online">
      <header className="kit-head">
        <div>
          <p className="kit-kicker">
            GO · 联机{v ? ` · ${v.size} 路 · 贴 ${v.komi}` : ''}
          </p>
          <h2 className="kit-sr">围棋联机</h2>
        </div>
        <a className="play-back" href="/games/go">
          返回单机
        </a>
      </header>
      <Lobby
        snap={snap}
        client={client}
        game="go"
        options={{
          node: (
            <div className="kit-row">
              <label>
                棋盘
                <select ref={size} defaultValue="9" aria-label="棋盘大小">
                  <option value="9">9 路</option>
                  <option value="13">13 路</option>
                  <option value="19">19 路</option>
                </select>
              </label>
              <label>
                我执
                <select ref={color} defaultValue="random" aria-label="执色">
                  <option value="random">随机</option>
                  <option value="black">黑（先手）</option>
                  <option value="white">白</option>
                </select>
              </label>
              <label>
                让子
                <select ref={handicap} defaultValue="0" aria-label="让子">
                  <option value="0">不让子</option>
                  {[2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      让 {n} 子
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ),
          value: () => ({
            size: Number(size.current?.value ?? 9),
            creator: color.current?.value ?? 'random',
            handicap: Number(handicap.current?.value ?? 0),
          }),
        }}
      >
        {v && <Table v={v} act={(a) => client.act(a)} seat={snap.seat} />}
      </Lobby>
      <p className="kit-help">
        开一个房间，把邀请链接发给朋友，对方打开就入座；不需要注册。断线或刷新后会自动回到原来的座位。悔棋需要对方同意；双方连续停一手后进入点目：系统先标出死子，任何一方可以点棋子改判，双方都确认后按中国规则数子。
      </p>
    </div>
  );
}

function Table({
  v,
  seat,
  act,
}: {
  v: GoOnlineView;
  seat: number | null;
  act: (a: unknown) => void;
}) {
  const n = v.size;
  const stars = starPoints(n);
  const dead = new Set(v.dead);
  const last = v.moves.length ? v.moves[v.moves.length - 1] : -1;
  const myTurn = v.started && v.phase === 'play' && v.toPlay === v.you;
  const opp = seat === null ? null : 1 - seat;
  const status = !v.started
    ? '等待对手入座…'
    : v.phase === 'scoring'
      ? '点目：点棋子标记 / 取消死子，双方确认后结算'
      : v.phase === 'over'
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
          提子 黑 <strong>{v.captures[0]}</strong> · 白{' '}
          <strong>{v.captures[1]}</strong>
        </span>
        <span>
          手数 <strong>{v.moves.length}</strong>
        </span>
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
      {v.phase === 'scoring' && v.tally && (
        <div className="play-ask">
          当前数子：黑 {v.tally.black} · 白 {v.tally.white}（含贴目）
          <button
            type="button"
            className="kit-primary"
            disabled={seat === null || v.confirmed[seat]}
            onClick={() => act({ type: 'confirm' })}
          >
            {seat !== null && v.confirmed[seat] ? '已确认' : '确认结果'}
          </button>
          <button type="button" onClick={() => act({ type: 'resume' })}>
            有分歧，继续下
          </button>
          {opp !== null && v.confirmed[opp] && <span>对方已确认</span>}
        </div>
      )}
      {v.result && (
        <output
          className={`play-result ${v.result.winner === v.you ? 'kit-ok' : 'kit-bad'}`}
        >
          <strong>
            {v.result.winner === v.you
              ? '你赢了'
              : v.you
                ? '你输了'
                : `${NAME[v.result.winner]}胜`}
          </strong>
          <span>
            {v.result.reason === 'resign'
              ? `${NAME[v.result.winner === BLACK ? WHITE : BLACK]}方认输`
              : `黑 ${v.result.black} · 白 ${v.result.white}，${NAME[v.result.winner]}胜 ${v.result.margin} 子`}
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
      <fieldset
        className={`go-board${v.phase === 'scoring' ? ' is-scoring' : ''}`}
        style={{ ['--n' as string]: n }}
        aria-label={`${n} 路联机棋盘`}
        disabled={!(myTurn || v.phase === 'scoring')}
      >
        {Array.from({ length: n * n }, (_, p) => {
          const x = p % n;
          const y = Math.floor(p / n);
          const c = v.board[p];
          const cls = [
            'go-pt',
            x === 0 && 'is-l',
            x === n - 1 && 'is-r',
            y === 0 && 'is-t',
            y === n - 1 && 'is-b',
            stars.has(p) && 'is-star',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={p}
              type="button"
              data-pt={p}
              className={cls}
              aria-label={`${coordName(n, p)}${c === BLACK ? ' 黑子' : c === WHITE ? ' 白子' : ''}${dead.has(p) ? '（死）' : ''}`}
              onClick={() =>
                v.phase === 'scoring'
                  ? c && act({ type: 'toggle-dead', p })
                  : act({ type: 'move', p })
              }
            >
              {c !== 0 && (
                <span
                  className={`go-stone ${c === BLACK ? 'is-black' : 'is-white'}${dead.has(p) ? ' is-dead' : ''}${last === p ? ' is-last' : ''}`}
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </fieldset>
      <div className="kit-row" role="toolbar" aria-label="对局操作">
        <button
          type="button"
          disabled={!myTurn}
          onClick={() => act({ type: 'pass' })}
        >
          <Hand size={15} aria-hidden="true" /> 停一手
        </button>
        <button
          type="button"
          data-shortcut="z"
          title="请求悔棋 (Z)"
          disabled={v.phase !== 'play' || !v.started || v.undoFrom !== null}
          onClick={() => act({ type: 'undo-request' })}
        >
          <Undo2 size={15} aria-hidden="true" /> 请求悔棋
        </button>
        <button
          type="button"
          disabled={v.phase === 'over' || !v.started}
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
