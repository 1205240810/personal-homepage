'use client';

import { useRef, useState } from 'react';
import '@/components/games/kit.css';
import type {
  HoldemOnlineView,
  HoldemSeatView,
} from '@/lib/multiplayer/holdem-online';
import { Lobby } from './lobby';
import { PlayingCard, useCountdown } from './online-blackjack';
import { useRoom } from './use-room';
import './table.css';

const STYLE_LABELS: Record<string, string> = {
  balanced: '均衡',
  careful: '稳健',
  active: '积极',
  tricky: '灵活',
};
const STREETS: Record<string, string> = {
  preflop: '翻牌前',
  flop: '翻牌',
  turn: '转牌',
  river: '河牌',
  complete: '摊牌',
};
// Engine cards: rank = n/4 + 2 (2..14), suit n%4 = ♠ ♥ ♣ ♦.
const SUIT_MAP = [0, 1, 3, 2];
const toCard = (n: number) => {
  const r = Math.floor(n / 4) + 2;
  return { r: r === 14 ? 1 : r, s: SUIT_MAP[n % 4] };
};
const Card = ({ n }: { n: number | null }) => (
  <PlayingCard c={n === null ? null : toCard(n)} />
);

export function HoldemOnline() {
  const [snap, client] = useRoom<HoldemOnlineView>('holdem');
  const [bots, setBots] = useState(2);
  const [styles, setStyles] = useState(['careful', 'active', 'tricky']);
  const diff = useRef<HTMLSelectElement>(null);
  const v = snap.view;
  return (
    <div className="kit play-table-page">
      <header className="kit-head">
        <div>
          <p className="kit-kicker">
            {"HOLD'EM · 双人联手"}
            {v?.hand
              ? ` · 盲注 ${v.blinds[0]}/${v.blinds[1]} · 第 ${v.hand} 手`
              : ''}
          </p>
          <h2 className="kit-sr">德州联机</h2>
        </div>
        <a className="play-back" href="/games/holdem-lab">
          返回单机
        </a>
      </header>
      <Lobby
        snap={snap}
        client={client}
        game="holdem"
        createLabel="开一张德州桌"
        options={{
          node: (
            <>
              <label>
                AI 对手
                <select
                  value={bots}
                  onChange={(e) => setBots(Number(e.target.value))}
                  aria-label="AI 数量"
                >
                  <option value="1">1 位（灯塔）</option>
                  <option value="2">2 位（灯塔、疾风）</option>
                  <option value="3">3 位（灯塔、疾风、帷幕）</option>
                </select>
              </label>
              {['灯塔', '疾风', '帷幕'].slice(0, bots).map((name, i) => (
                <label key={name}>
                  {name}的风格
                  <select
                    aria-label={`${name}的风格`}
                    value={styles[i]}
                    onChange={(e) =>
                      setStyles(
                        styles.map((s, j) => (j === i ? e.target.value : s)),
                      )
                    }
                  >
                    {Object.entries(STYLE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <label>
                AI 难度
                <select ref={diff} defaultValue="standard" aria-label="AI 难度">
                  <option value="casual">入门</option>
                  <option value="standard">标准</option>
                  <option value="advanced">进阶</option>
                </select>
              </label>
            </>
          ),
          value: () => ({
            bots,
            styles: styles.slice(0, bots),
            difficulty: diff.current?.value ?? 'standard',
          }),
        }}
      >
        {v && (
          <Table
            v={v}
            names={snap.seats.map((s) => s.name)}
            act={(a) => client.act(a)}
          />
        )}
      </Lobby>
      <details className="play-rules">
        <summary>联机规则</summary>
        <p>
          你和朋友坐在同一张桌上，一起对抗单机练习桌里的 AI 性格；每位 AI
          可分别选均衡、稳健、积极或灵活风格。每人起始 1000 筹码，盲注
          5/10，庄位每手顺移。牌由服务器洗发，AI
          也在服务器上思考，它们和你的朋友都看不到你的底牌；只有摊牌时才公开未弃牌玩家的底牌。每次行动限时
          30 秒，超时能过牌就过牌，否则弃牌。一手结束后两人都点「下一手」或等 7
          秒自动发牌；筹码输光会自动补码，并记录补码次数。
        </p>
      </details>
    </div>
  );
}

function Seat({
  s,
  i,
  v,
  names,
  left,
}: {
  s: HoldemSeatView;
  i: number;
  v: HoldemOnlineView;
  names: string[];
  left: number | null;
}) {
  const mine = i === v.me;
  const name =
    s.kind === 'ai' ? s.name : names[s.player!] || `玩家 ${s.player! + 1}`;
  const winner = v.result?.winners.includes(i);
  return (
    <div
      className={`pt-seat ph-seat${v.toAct === i ? ' is-acting' : ''}${s.folded ? ' is-folded' : ''}${winner ? ' is-winner' : ''}${mine ? ' is-me' : ''}`}
    >
      <div className="pt-seat-head">
        {v.button === i && (
          <span className="pt-role" title="庄位">
            D
          </span>
        )}
        <span className="pt-name">
          {name}
          {mine ? '（你）' : s.kind === 'human' ? '（队友）' : ''}
        </span>
        {s.kind === 'ai' && (
          <span className="ph-style">AI · {STYLE_LABELS[s.style!]}</span>
        )}
        <span className="pt-chips">
          <strong>{s.stack}</strong>
        </span>
      </div>
      <div className="pt-cards ph-hole">
        {s.cards === null ? (
          s.folded ? null : (
            <>
              <Card n={null} />
              <Card n={null} />
            </>
          )
        ) : (
          s.cards.map((c) => <Card key={c} n={c} />)
        )}
      </div>
      <p className="ph-status">
        {s.folded
          ? '已弃牌'
          : winner
            ? `赢得 ${s.won}${s.label ? ` · ${s.label}` : ''}`
            : s.label
              ? s.label
              : s.allIn
                ? '全下'
                : s.bet
                  ? `下注 ${s.bet}`
                  : ' '}
        {v.toAct === i && left !== null && (
          <span className="pt-timer kit-mono"> {left}s</span>
        )}
        {s.rebuys > 0 && <span className="ph-rebuy">补码 ×{s.rebuys}</span>}
      </p>
    </div>
  );
}

function Table({
  v,
  names,
  act,
}: {
  v: HoldemOnlineView;
  names: string[];
  act: (a: unknown) => void;
}) {
  const left = useCountdown(v.result ? null : v.deadline);
  const nextIn = useCountdown(v.result ? v.deadline : null);
  const order = v.seats.map((_, i) => i);
  const me = v.me ?? 0;
  const others = [...order.slice(me + 1), ...order.slice(0, me)];
  return (
    <div className="pt-felt ph-felt">
      <div className="ph-others">
        {others.map((i) => (
          <Seat key={i} s={v.seats[i]} i={i} v={v} names={names} left={left} />
        ))}
      </div>
      <div className="pt-center ph-center" aria-live="polite">
        {!v.started ? (
          <span>等待队友入座…</span>
        ) : (
          <>
            <div className="ph-board">
              {[0, 1, 2, 3, 4].map((k) =>
                v.board[k] !== undefined ? (
                  <Card key={v.board[k]} n={v.board[k]} />
                ) : (
                  <span key={k} className="ph-slot" />
                ),
              )}
            </div>
            <span>
              {v.street ? STREETS[v.street] : ''} · 底池{' '}
              <strong className="ph-pot">{v.pot}</strong>
            </span>
            {v.log.length > 0 && !v.result && (
              <small className="pt-log">
                {v.log
                  .slice(-3)
                  .map(
                    (l) =>
                      `${v.seats[l.seat].kind === 'ai' ? v.seats[l.seat].name : l.seat === v.me ? '你' : '队友'} ${l.text}`,
                  )
                  .join(' · ')}
              </small>
            )}
            {v.result && (
              <div className="pt-outcome">
                <strong>
                  {v.result.winners.length > 1
                    ? `${v.result.winners.map((w) => (w === me ? '你' : v.seats[w].kind === 'ai' ? v.seats[w].name : '队友')).join('、')} 分别赢得底池`
                    : v.result.winners.includes(me)
                      ? '你赢下底池'
                      : v.result.winners.some(
                            (w) => v.seats[w].kind === 'human',
                          )
                        ? '队友赢下底池'
                        : `${v.result.winners.map((w) => v.seats[w].name).join('、')} 赢下底池`}
                </strong>
                <span>
                  {v.result.reason === 'fold' ? '其他人弃牌' : '摊牌'}
                </span>
                <button
                  type="button"
                  className="kit-primary"
                  data-shortcut="n"
                  disabled={v.you === null || v.ready[v.you]}
                  onClick={() => act({ type: 'next' })}
                >
                  {v.you !== null && v.ready[v.you]
                    ? '等队友…'
                    : `下一手${nextIn !== null ? `（${nextIn}s）` : ''}`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
      {v.me !== null && (
        <Seat s={v.seats[me]} i={me} v={v} names={names} left={left} />
      )}
      <Actions v={v} act={act} />
    </div>
  );
}

function Actions({
  v,
  act,
}: {
  v: HoldemOnlineView;
  act: (a: unknown) => void;
}) {
  const l = v.legal;
  const [to, setTo] = useState<number | null>(null);
  const raiseTo = l ? Math.min(l.maxTo, Math.max(l.minTo, to ?? l.minTo)) : 0;
  const send = (a: unknown) => {
    setTo(null);
    act(a);
  };
  const size = (x: number) => setTo(Math.round(x));
  return (
    <div className="ph-actions" role="toolbar" aria-label="行动">
      <div className="kit-row pt-actions">
        <button
          type="button"
          data-shortcut="f"
          disabled={!l}
          onClick={() => send({ type: 'fold' })}
        >
          弃牌
        </button>
        <button
          type="button"
          data-shortcut="c"
          disabled={!l}
          onClick={() =>
            send(l?.canCheck ? { type: 'check' } : { type: 'call' })
          }
        >
          {l && !l.canCheck ? `跟注 ${l.call}` : '过牌'}
        </button>
        <button
          type="button"
          className="kit-primary"
          data-shortcut="r"
          disabled={!l?.canRaise}
          onClick={() => send({ type: 'raise', to: raiseTo })}
        >
          {raiseTo >= (l?.maxTo ?? Infinity) ? '全下' : '加注到'}{' '}
          {l?.canRaise ? raiseTo : ''}
        </button>
      </div>
      {l?.canRaise && (
        <div className="ph-sizer">
          <input
            type="range"
            min={Math.min(l.minTo, l.maxTo)}
            max={l.maxTo}
            step={1}
            value={raiseTo}
            aria-label="加注额"
            onChange={(e) => setTo(Number(e.target.value))}
          />
          <button type="button" onClick={() => size(l.minTo)}>
            最小
          </button>
          <button type="button" onClick={() => size(l.call + l.pot / 2)}>
            ½ 池
          </button>
          <button type="button" onClick={() => size(l.call + l.pot)}>
            1 池
          </button>
          <button type="button" onClick={() => size(l.maxTo)}>
            全下
          </button>
        </div>
      )}
    </div>
  );
}
