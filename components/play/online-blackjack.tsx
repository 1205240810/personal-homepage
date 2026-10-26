'use client';

import { Hand, Layers, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import '@/components/games/kit.css';
import { countdownSeconds, type PlayClock } from '@/lib/multiplayer/clock';
import type { Card, DuelView } from '@/lib/multiplayer/blackjack-duel';
import { Lobby } from './lobby';
import { useRoom } from './use-room';
import './table.css';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = [
  '',
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
];

export function PlayingCard({ c }: { c: Card | null }) {
  if (!c)
    return (
      <span className="pc pc-back" aria-label="暗牌">
        <span aria-hidden="true" />
      </span>
    );
  const red = c.s === 1 || c.s === 2;
  return (
    <span
      className={`pc${red ? ' is-red' : ''}`}
      aria-label={`${SUITS[c.s]}${RANKS[c.r]}`}
    >
      <b>{RANKS[c.r]}</b>
      <i aria-hidden="true">{SUITS[c.s]}</i>
    </span>
  );
}

export function useCountdown(deadline: number | null, clock: PlayClock | null) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (deadline === null || clock === null) return;
    const id = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(id);
  }, [deadline, clock]);
  return countdownSeconds(deadline, clock, now);
}

export function BlackjackOnline() {
  const [snap, client] = useRoom<DuelView>('blackjack-duel');
  const stake = useRef<HTMLSelectElement>(null);
  const v = snap.view;
  return (
    <div className="kit play-table-page">
      <header className="kit-head">
        <div>
          <p className="kit-kicker">
            BLACKJACK · 单挑{v ? ` · 底注 ${v.stake} · 第 ${v.round} 局` : ''}
          </p>
          <h2 className="kit-sr">21 点单挑</h2>
        </div>
        <a className="play-back" href="/games/blackjack">
          返回单机
        </a>
      </header>
      <Lobby
        snap={snap}
        client={client}
        game="blackjack-duel"
        createLabel="开一张单挑桌"
        options={{
          node: (
            <label>
              底注（每人起始 1000 筹码）
              <select ref={stake} defaultValue="20" aria-label="底注">
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
              </select>
            </label>
          ),
          value: () => ({ stake: Number(stake.current?.value ?? 20) }),
        }}
      >
        {v && (
          <Table
            v={v}
            clock={snap.clock}
            names={snap.seats.map((s) => s.name)}
            act={(a) => client.act(a)}
          />
        )}
      </Lobby>
      <details className="play-rules">
        <summary>单挑规则</summary>
        <p>
          两人轮流坐庄。每局双方各下底注，各拿两张牌，第一张是只有自己能看到的暗牌。闲家先行动：要牌、停牌，或者加倍（再拿一张后停牌，本局输赢翻倍）；闲家爆牌则庄家直接赢。随后庄家看着闲家的明牌行动。比点数大小，两张牌就是
          21 点（黑杰克）赢 1.5
          倍，平局退回底注。下一局交换庄闲，所以“后手看牌”的优势双方轮流拥有。每次行动限时
          30 秒，超时自动停牌。牌由服务器洗牌发牌（6
          副牌），谁都看不到牌靴和对方暗牌；一方筹码不够底注时比赛结束。
        </p>
      </details>
    </div>
  );
}

function Table({
  v,
  clock,
  names,
  act,
}: {
  v: DuelView;
  clock: PlayClock | null;
  names: string[];
  act: (a: unknown) => void;
}) {
  const me = v.you ?? 0;
  const opp = me === 0 ? 1 : 0;
  const left = useCountdown(v.deadline, clock);
  const myTurn =
    (v.phase === 'player' && v.banker !== me) ||
    (v.phase === 'banker' && v.banker === me);
  const role = (s: number) => (s === v.banker ? '庄' : '闲');
  const seatBox = (s: number, mine: boolean) => (
    <div
      className={`pt-seat${(v.phase === 'player' && v.banker !== s) || (v.phase === 'banker' && v.banker === s) ? ' is-acting' : ''}`}
    >
      <div className="pt-seat-head">
        <span className="pt-role">{role(s)}</span>
        <span className="pt-name">
          {names[s] || `玩家 ${s + 1}`}
          {mine && '（你）'}
        </span>
        <span className="pt-chips">
          <strong>{v.chips[s]}</strong> 筹码
        </span>
        {v.doubled[s] && <span className="pt-tag">加倍</span>}
      </div>
      <div className="pt-cards">
        {v.hands[s].map((c, i) => (
          <PlayingCard key={i} c={c} />
        ))}
      </div>
      <p className="pt-total">
        {v.totals[s] !== null
          ? `${v.totals[s]} 点`
          : v.hands[s].length
            ? '？'
            : ''}
        {mine &&
          v.hands[s].length > 0 &&
          v.phase !== 'done' &&
          v.phase !== 'over' && <span>（暗牌只有你能看到）</span>}
      </p>
    </div>
  );
  return (
    <div className="pt-felt">
      {seatBox(opp, false)}
      <div className="pt-center" aria-live="polite">
        {!v.started ? (
          <span>等待对手入座…</span>
        ) : v.phase === 'done' || v.phase === 'over' ? (
          <Outcome v={v} me={me} act={act} />
        ) : (
          <span>
            {myTurn ? '轮到你' : `等${role(opp)}家行动`}
            {left !== null && (
              <span className="pt-timer kit-mono"> {left}s</span>
            )}
          </span>
        )}
        {v.log.length > 0 && (
          <small className="pt-log">{v.log.join(' · ')}</small>
        )}
      </div>
      {seatBox(me, true)}
      <div className="kit-row pt-actions" role="toolbar" aria-label="行动">
        <button
          type="button"
          className="kit-primary"
          data-shortcut="h"
          disabled={!myTurn}
          onClick={() => act({ type: 'hit' })}
        >
          <Plus size={15} aria-hidden="true" /> 要牌
        </button>
        <button
          type="button"
          data-shortcut="s"
          disabled={!myTurn}
          onClick={() => act({ type: 'stand' })}
        >
          <Hand size={15} aria-hidden="true" /> 停牌
        </button>
        <button
          type="button"
          data-shortcut="d"
          disabled={!v.canDouble}
          onClick={() => act({ type: 'double' })}
        >
          <Layers size={15} aria-hidden="true" /> 加倍
        </button>
      </div>
    </div>
  );
}

function Outcome({
  v,
  me,
  act,
}: {
  v: DuelView;
  me: number;
  act: (a: unknown) => void;
}) {
  const r = v.result;
  if (!r) return null;
  const over = v.phase === 'over';
  const title =
    r.winner === null
      ? '平局'
      : r.winner === me
        ? `你赢 ${r.delta[me]}`
        : `你输 ${-r.delta[me]}`;
  return (
    <div
      className={`pt-outcome ${r.winner === me ? 'kit-ok' : r.winner === null ? '' : 'kit-bad'}`}
    >
      <strong>
        {over
          ? v.chips[me] > v.chips[me === 0 ? 1 : 0]
            ? '比赛胜利'
            : '比赛结束'
          : title}
      </strong>
      <span>{r.why}</span>
      <button
        type="button"
        className="kit-primary"
        data-shortcut="n"
        disabled={v.ready[me]}
        onClick={() => act({ type: over ? 'rematch' : 'next' })}
      >
        {v.ready[me] ? '等对方…' : over ? '再比一场' : '下一局（交换庄闲）'}
      </button>
      {v.ready[me === 0 ? 1 : 0] && !v.ready[me] && <span>对方已准备</span>}
    </div>
  );
}
