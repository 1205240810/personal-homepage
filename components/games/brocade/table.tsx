'use client';

import { useState, type ReactNode } from 'react';
import {
  CARDS,
  GEMS,
  GOLD,
  GOLD_NAME,
  NOBLES,
  RESERVE_LIMIT,
  TOKEN_LIMIT,
  bonuses,
  payment,
  points,
  tokenCount,
  type BrocadeView,
  type Gem,
  type Move,
  type Player,
  type Side,
} from '@/lib/games/brocade';
import './brocade.css';

const TIER = ['作坊', '绣庄', '名品'] as const;
const gemName = (g: number) => (g === GOLD ? GOLD_NAME : GEMS[g].name);

export function Chip({
  g,
  n,
  small,
}: {
  g: number;
  n?: number;
  small?: boolean;
}) {
  return (
    <span
      className={`bc-chip g${g}${small ? ' is-small' : ''}`}
      aria-label={`${gemName(g)}${n !== undefined ? ` ${n}` : ''}`}
    >
      {n !== undefined ? n : g === GOLD ? '金' : GEMS[g].glyph}
    </span>
  );
}

export function CardFace({ id }: { id: number }) {
  if (id < 0)
    return (
      <span
        className={`bc-card is-back t${-1 - id}`}
        aria-label={`暗订的${TIER[-1 - id]}`}
      >
        <b>{TIER[-1 - id]}</b>
      </span>
    );
  const c = CARDS[id];
  return (
    <span
      className={`bc-card t${c.tier} g${c.color}`}
      aria-label={`${TIER[c.tier]}·${GEMS[c.color].name}${c.points ? ` ${c.points} 分` : ''}，需 ${c.cost
        .map((n, g) => (n ? `${GEMS[g].name}${n}` : ''))
        .filter(Boolean)
        .join(' ')}`}
    >
      <span className="bc-card-top">
        <b>{c.points || ''}</b>
        <Chip g={c.color} small />
      </span>
      <span className="bc-cost">
        {c.cost.map((n, g) => (n ? <Chip key={g} g={g} n={n} small /> : null))}
      </span>
    </span>
  );
}

function Summary({
  p,
  name,
  active,
}: {
  p: BrocadeView['players'][number];
  name: ReactNode;
  active?: boolean;
}) {
  const b = bonuses(p);
  return (
    <div className={`bc-summary${active ? ' is-active' : ''}`}>
      <header>
        <strong>{name}</strong>
        <span className="bc-pts">{points(p)} 分</span>
        <span className="kit-help">
          丝线 {tokenCount(p)}/10 · 预订 {p.reserved.length}/3
        </span>
      </header>
      <div className="bc-holdings">
        {[0, 1, 2, 3, 4].map((g) => (
          <span
            key={g}
            className="bc-hold"
            title={`${GEMS[g].name}：加成 ${b[g]}，丝线 ${p.tokens[g]}`}
          >
            <span className={`bc-bonus g${g}`}>{b[g]}</span>
            <Chip g={g} n={p.tokens[g]} small />
          </span>
        ))}
        <span className="bc-hold">
          <Chip g={GOLD} n={p.tokens[GOLD]} small />
        </span>
      </div>
    </div>
  );
}

type Sel = { kind: 'card'; id: number } | { kind: 'deck'; tier: number } | null;

/** 锦绣织造牌桌：点丝线凑一手再「拿取」；点作品选择购入或预订；点牌堆背面暗订。 */
export function BrocadeTable({
  v,
  disabled,
  names,
  onMove,
  status,
  footer,
}: {
  v: BrocadeView;
  disabled?: boolean;
  names: [string, string];
  onMove: (m: Move) => void;
  status?: ReactNode;
  footer?: ReactNode;
}) {
  const me = (v.you ?? 0) as Side;
  const opp = (1 - me) as Side;
  const live = !disabled && v.phase === 'play' && v.toPlay === me;
  const mine = v.players[me] as Player;
  const [gems, setGems] = useState<Gem[]>([]);
  const [sel, setSel] = useState<Sel>(null);
  const [ret, setRet] = useState<number[]>([]);
  const [pending, setPending] = useState<Move | null>(null);
  const reset = () => {
    setGems([]);
    setSel(null);
    setRet([]);
    setPending(null);
  };
  const gained = [0, 0, 0, 0, 0, 0];
  if (pending?.t === 'take') pending.gems.forEach((g) => gained[g]++);
  if (pending?.t === 'reserve' && v.bank[GOLD] > 0) gained[GOLD]++;
  const after = mine.tokens.map(
    (n, g) => n + gained[g] - ret.filter((x) => x === g).length,
  );
  const over = pending
    ? mine.tokens.reduce((a, b) => a + b, 0) +
      gained.reduce((a, b) => a + b, 0) -
      TOKEN_LIMIT
    : 0;
  const submit = (m: Move) => {
    const total =
      mine.tokens.reduce((a, b) => a + b, 0) +
      (m.t === 'take'
        ? m.gems.length
        : m.t === 'reserve' && v.bank[GOLD] > 0
          ? 1
          : 0);
    if (m.t !== 'buy' && total > TOKEN_LIMIT) {
      setPending(m);
      setRet([]);
      return;
    }
    reset();
    onMove(m);
  };
  const avail = [0, 1, 2, 3, 4].filter((g) => v.bank[g] > 0).length;
  const takeOk =
    (gems.length === 2 && gems[0] === gems[1] && v.bank[gems[0]] >= 4) ||
    (new Set(gems).size === gems.length &&
      gems.length === Math.min(3, avail) &&
      gems.length > 0);
  const clickBank = (g: Gem) => {
    if (!live || pending) return;
    setSel(null);
    const count = gems.filter((x) => x === g).length;
    if (count) {
      // Second click on the same colour turns it into a pair when allowed.
      if (gems.length === 1 && v.bank[g] >= 4) setGems([g, g]);
      else setGems(gems.filter((x) => x !== g));
      return;
    }
    if (gems.length === 2 && gems[0] === gems[1]) return setGems([g]);
    if (gems.length < 3) setGems([...gems, g]);
  };
  const selCard = sel?.kind === 'card' ? sel.id : null;
  const canBuy = selCard !== null && !!payment(mine, selCard);
  const canReserve = mine.reserved.length < RESERVE_LIMIT;
  return (
    <div className="bc-table">
      <Summary
        p={v.players[opp]}
        name={names[opp]}
        active={v.toPlay === opp && v.phase === 'play'}
      />
      {v.players[opp].reserved.length > 0 && (
        <div className="bc-reserved is-opp" aria-label="对方预订">
          {v.players[opp].reserved.map((id, k) => (
            <CardFace key={k} id={id} />
          ))}
        </div>
      )}
      <div className="bc-nobles" aria-label="宫廷贵客">
        {v.nobles.map((id) => (
          <span
            key={id}
            className="bc-noble"
            aria-label={`贵客 3 分，需加成 ${NOBLES[id].need
              .map((n, g) => (n ? `${GEMS[g].name}${n}` : ''))
              .filter(Boolean)
              .join(' ')}`}
          >
            <b>3</b>
            <i>贵客</i>
            <span>
              {NOBLES[id].need.map((n, g) =>
                n ? (
                  <span key={g} className={`bc-bonus g${g}`}>
                    {n}
                  </span>
                ) : null,
              )}
            </span>
          </span>
        ))}
      </div>
      <div className="bc-market">
        {[2, 1, 0].map((t) => (
          <div key={t} className="bc-tier">
            <button
              type="button"
              className={`bc-deck t${t}${sel?.kind === 'deck' && sel.tier === t ? ' is-selected' : ''}`}
              disabled={!live || !v.deckCounts[t] || !canReserve || !!pending}
              onClick={() => {
                setGems([]);
                setSel(
                  sel?.kind === 'deck' && sel.tier === t
                    ? null
                    : { kind: 'deck', tier: t },
                );
              }}
              aria-label={`${TIER[t]}牌堆 ${v.deckCounts[t]} 张${live ? '：点选可暗订' : ''}`}
            >
              <b>{TIER[t]}</b>
              <i>{v.deckCounts[t]}</i>
            </button>
            {v.market[t].map((id, k) =>
              id === null ? (
                <span key={k} className="bc-card is-empty" />
              ) : (
                <button
                  key={id}
                  type="button"
                  className={`bc-pick${selCard === id ? ' is-selected' : ''}${payment(mine, id) ? ' can-buy' : ''}`}
                  disabled={!live || !!pending}
                  onClick={() => {
                    setGems([]);
                    setSel(selCard === id ? null : { kind: 'card', id });
                  }}
                >
                  <CardFace id={id} />
                </button>
              ),
            )}
          </div>
        ))}
      </div>
      <div className="bc-bank" aria-label="丝线库">
        {[0, 1, 2, 3, 4].map((g) => {
          const n = gems.filter((x) => x === g).length;
          return (
            <button
              key={g}
              type="button"
              className={`bc-bank-pile${n ? ' is-selected' : ''}`}
              disabled={!live || !v.bank[g] || !!pending}
              onClick={() => clickBank(g as Gem)}
              aria-label={`${GEMS[g].name}，剩 ${v.bank[g]}${n ? `，已选 ${n}` : ''}`}
            >
              <Chip g={g} />
              <i>{v.bank[g]}</i>
              {n > 0 && <em>+{n}</em>}
            </button>
          );
        })}
        <span className="bc-bank-pile is-gold">
          <Chip g={GOLD} />
          <i>{v.bank[GOLD]}</i>
        </span>
      </div>
      {status && (
        <p className="bc-status" aria-live="polite">
          {status}
        </p>
      )}
      {live && !pending && (
        <div className="kit-row bc-actions">
          {gems.length > 0 && (
            <button
              type="button"
              className={takeOk ? 'kit-primary' : undefined}
              disabled={!takeOk}
              data-shortcut="t"
              onClick={() => submit({ t: 'take', gems })}
            >
              拿取 {gems.map((g) => GEMS[g].glyph).join('')}
            </button>
          )}
          {selCard !== null && (
            <>
              <button
                type="button"
                className={canBuy ? 'kit-primary' : undefined}
                disabled={!canBuy}
                data-shortcut="b"
                onClick={() => submit({ t: 'buy', card: selCard })}
              >
                购入
              </button>
              {!mine.reserved.includes(selCard) && (
                <button
                  type="button"
                  disabled={!canReserve}
                  onClick={() => submit({ t: 'reserve', card: selCard })}
                >
                  预订{v.bank[GOLD] > 0 ? '（得金线）' : ''}
                </button>
              )}
            </>
          )}
          {sel?.kind === 'deck' && (
            <button
              type="button"
              className="kit-primary"
              onClick={() =>
                submit({ t: 'reserve', card: null, tier: sel.tier })
              }
            >
              暗订一张{TIER[sel.tier]}
            </button>
          )}
          {(gems.length > 0 || sel) && (
            <button type="button" onClick={reset}>
              取消
            </button>
          )}
        </div>
      )}
      {pending && (
        <fieldset className="bc-return" aria-label="退还丝线">
          <span>
            超过 10 枚，请点选退还 {over} 枚（已选 {ret.length}）：
          </span>
          {[0, 1, 2, 3, 4, 5].map((g) =>
            after[g] > 0 ? (
              <button
                key={g}
                type="button"
                className="bc-pick"
                disabled={ret.length >= over}
                onClick={() => setRet([...ret, g])}
              >
                <Chip g={g} n={after[g]} />
              </button>
            ) : null,
          )}
          <button
            type="button"
            className="kit-primary"
            disabled={ret.length !== over}
            onClick={() => {
              const m = { ...pending, ret } as Move;
              reset();
              onMove(m);
            }}
          >
            确认
          </button>
          <button type="button" onClick={reset}>
            取消
          </button>
        </fieldset>
      )}
      <Summary p={v.players[me]} name={names[me]} active={live} />
      {mine.reserved.length > 0 && (
        <div className="bc-reserved" aria-label="你的预订">
          {mine.reserved.map((id) => (
            <button
              key={id}
              type="button"
              className={`bc-pick${selCard === id ? ' is-selected' : ''}${payment(mine, id) ? ' can-buy' : ''}`}
              disabled={!live || !!pending}
              onClick={() => {
                setGems([]);
                setSel(selCard === id ? null : { kind: 'card', id });
              }}
            >
              <CardFace id={id} />
            </button>
          ))}
        </div>
      )}
      {footer}
    </div>
  );
}
