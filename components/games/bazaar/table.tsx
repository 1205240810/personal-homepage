'use client';

import { useRef, useState, type ReactNode } from 'react';
import {
  CAMEL,
  GOODS,
  HAND_LIMIT,
  cardLabel,
  type BazaarView,
  type Card,
  type Good,
  type Move,
  type Side,
} from '@/lib/games/bazaar';
import { WareArt } from './art';
import './bazaar.css';

// CSS, inline SVG and text form a single illustrated card.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */
export function Ware({ c, small }: { c: Card; small?: boolean }) {
  const camel = c === CAMEL;
  return (
    <span
      className={`bz-card g${c}${small ? ' is-small' : ''}`}
      role="img"
      aria-label={cardLabel(c)}
    >
      <WareArt c={c} />
      <b aria-hidden="true">{camel ? '驼' : GOODS[c].glyph}</b>
      <i aria-hidden="true">{cardLabel(c)}</i>
    </span>
  );
}

/* oxlint-enable jsx-a11y/prefer-tag-over-role */

const sum = (a: readonly number[]) => a.reduce((x, y) => x + y, 0);
const pts = (v: BazaarView, p: Side) => {
  const b = v.bonusWon[p];
  return sum(v.won[p]) + (Array.isArray(b) ? sum(b) : 0);
};

/**
 * 刺桐市集牌桌。选中市集里的货、手里的货或驼队，再点下方的动作按钮：
 * 拿一件、牵走全部骆驼、换货（换入换出件数相等）、卖出同一种货。
 */
export function BazaarTable({
  v,
  disabled,
  names,
  onMove,
  status,
  footer,
  positionKey,
}: {
  v: BazaarView;
  disabled?: boolean;
  names: [string, string];
  onMove: (m: Move) => void | boolean;
  positionKey?: string | number;
  status?: ReactNode;
  footer?: ReactNode;
}) {
  const me = (v.you ?? 0) as Side;
  const opp = (1 - me) as Side;
  const position = JSON.stringify([
    positionKey,
    v.you,
    v.round,
    v.phase,
    v.toPlay,
    v.hand,
    v.market,
    v.camels,
    v.sold,
    !!disabled,
  ]);
  const empty = (generation: number) => ({
    position,
    generation,
    take: [] as number[],
    give: [] as number[],
    camelsOut: 0,
    sending: false,
  });
  const [draft, setDraft] = useState(() => empty(0));
  let current = draft;
  if (draft.position !== position) {
    current = empty(draft.generation + 1);
    setDraft(current);
  }
  const { take, give, camelsOut, sending, generation } = current;
  const submitted = useRef<number | null>(null);
  const live =
    !disabled &&
    !sending &&
    v.you !== null &&
    v.phase === 'play' &&
    v.toPlay === me;
  const reset = () => setDraft(empty(generation));
  const act = (m: Move) => {
    if (!live || submitted.current === generation) return;
    submitted.current = generation;
    if (onMove(m) === false) {
      submitted.current = null;
      return;
    }
    setDraft({ ...empty(generation), sending: true });
  };
  const toggle = (field: 'take' | 'give', i: number) => {
    if (!live) return;
    setDraft((previous) => {
      const arr = previous[field];
      return {
        ...previous,
        [field]: arr.includes(i) ? arr.filter((x) => x !== i) : [...arr, i],
      };
    });
  };
  const marketCamels = v.market.filter((c) => c === CAMEL).length;
  const takenGoods = take.map((i) => v.market[i]);
  const giveCards: Card[] = [
    ...give.map((i) => v.hand[i]),
    ...Array.from({ length: camelsOut }, () => CAMEL as Card),
  ];
  const sellType =
    give.length &&
    !take.length &&
    !camelsOut &&
    give.every((i) => v.hand[i] === v.hand[give[0]])
      ? (v.hand[give[0]] as Good)
      : null;
  const canSell = sellType !== null && give.length >= GOODS[sellType].min;
  const canTakeOne =
    take.length === 1 && !giveCards.length && v.hand.length < HAND_LIMIT;
  const swapOk =
    take.length >= 2 &&
    giveCards.length === take.length &&
    !giveCards.some((c) => takenGoods.includes(c)) &&
    v.hand.length - give.length + take.length <= HAND_LIMIT;
  const lastSwap =
    v.last?.move.t === 'swap' && v.last.side === opp ? v.last.move : null;
  return (
    <div className="bz-table">
      <svg
        className="bz-harbour"
        viewBox="0 0 800 220"
        preserveAspectRatio="xMidYMin slice"
        aria-hidden="true"
      >
        <circle cx="660" cy="56" r="26" className="bz-sun" />
        <path d="M0 150h800v70H0z" className="bz-sea" />
        <path
          d="M0 158c40-6 80 6 120 0s80-6 120 0 80 6 120 0 80-6 120 0 80 6 120 0 80-6 120 0 60 4 80 0"
          className="bz-wave"
        />
        <g className="bz-far">
          <path d="M40 150v-20l30-10 40 6 50-14 60 12 40-6v32z" />
          <path d="M92 150V92h4l-6-6h22l-6 6h4v58zM96 86V70h12v16zM94 70l8-10 8 10z" />
          <path d="M150 150V100h4l-6-6h20l-6 6h4v50zM154 94V80h10v14zM152 80l7-9 7 9z" />
        </g>
        <g className="bz-junk">
          <path d="M470 148h120l-14 14H486z" />
          <path d="M520 146V70M556 146V86" strokeWidth="2" />
          <path
            d="M486 140c4-22 4-44 0-66h36c4 22 4 44 0 66zM528 140c3-16 3-34 0-50h30c3 16 3 34 0 50z"
            className="bz-sail"
          />
        </g>
      </svg>
      <div className="bz-who">
        <strong>{names[opp]}</strong>
        <span
          className="bz-backs"
          aria-label={`手里 ${v.handCounts[opp]} 件货`}
        >
          {Array.from({ length: v.handCounts[opp] }, (_, k) => (
            <i key={k} />
          ))}
        </span>
        <span>驼 {v.camels[opp]}</span>
        <span>
          银两 {pts(v, opp)}
          {!Array.isArray(v.bonusWon[opp]) && (v.bonusWon[opp] as number) > 0
            ? ` + ${v.bonusWon[opp]} 枚暗赏`
            : ''}
        </span>
        <span className="bz-seals" aria-label={`市舶印 ${v.seals[opp]} 枚`}>
          {[0, 1].map((k) => (
            <i key={k} className={k < v.seals[opp] ? 'is-on' : ''} />
          ))}
        </span>
      </div>
      <div className="bz-tokens" aria-label="货物银牌">
        {GOODS.map((g, i) => (
          <span
            key={g.name}
            className={`bz-pile g${i}`}
            title={`${g.name}：${v.tokens[i].join('、') || '已售罄'}`}
          >
            <b key={v.tokens[i].length}>{v.tokens[i][0] ?? '—'}</b>
            <i>
              {g.name} · 余 {v.tokens[i].length}
            </i>
          </span>
        ))}
        <span className="bz-pile is-bonus">
          <b>赏</b>
          <i>
            三 {v.bonusLeft[3]} · 四 {v.bonusLeft[4]} · 五 {v.bonusLeft[5]}
          </i>
        </span>
      </div>
      <div className="bz-market-wrap">
        <span className="bz-awning" aria-hidden="true" />
        <span className="bz-deck" aria-label={`货栈剩 ${v.deckCount} 张`}>
          <i aria-hidden="true" />
          {v.deckCount}
        </span>
        <fieldset className="bz-market" aria-label="市集">
          {v.market.map((c, i) => {
            const fresh = lastSwap
              ? lastSwap.give.length > 0 &&
                i >= v.market.length - lastSwap.give.length
              : false;
            return (
              <button
                key={`${i}-${c}`}
                type="button"
                className={`bz-slot${take.includes(i) ? ' is-selected' : ''}${fresh ? ' is-fresh' : ''}`}
                disabled={!live || c === CAMEL}
                aria-pressed={take.includes(i)}
                aria-label={`市集第 ${i + 1} 件：${cardLabel(c)}`}
                onClick={() => toggle('take', i)}
              >
                <Ware c={c} />
              </button>
            );
          })}
        </fieldset>
      </div>
      {status && (
        <p className="bz-status" aria-live="polite">
          {status}
        </p>
      )}
      {live && (
        <div className="kit-row bz-actions">
          <button
            type="button"
            className={canTakeOne ? 'kit-primary' : undefined}
            disabled={!canTakeOne}
            data-shortcut="t"
            onClick={() => act({ t: 'take', i: take[0] })}
          >
            {take.length === 1
              ? `拿走${cardLabel(v.market[take[0]])}`
              : '拿一件'}
          </button>
          <button
            type="button"
            disabled={!marketCamels}
            data-shortcut="c"
            onClick={() => act({ t: 'camels' })}
          >
            牵走骆驼 ×{marketCamels}
          </button>
          <button
            type="button"
            className={swapOk ? 'kit-primary' : undefined}
            disabled={!swapOk}
            data-shortcut="e"
            onClick={() => act({ t: 'swap', take, give: giveCards })}
          >
            换货 {take.length >= 2 ? `${giveCards.length}/${take.length}` : ''}
          </button>
          <button
            type="button"
            className={canSell ? 'kit-primary' : undefined}
            disabled={!canSell}
            data-shortcut="s"
            onClick={() =>
              sellType !== null &&
              act({ t: 'sell', good: sellType, n: give.length })
            }
          >
            {sellType !== null
              ? `卖出 ${give.length} 件${GOODS[sellType].name}`
              : '卖货'}
          </button>
          {(take.length > 0 || giveCards.length > 0) && (
            <button type="button" onClick={reset}>
              清空选择
            </button>
          )}
        </div>
      )}
      <div className="bz-mine">
        <button
          type="button"
          className={`bz-herd${camelsOut ? ' is-selected' : ''}`}
          disabled={!live || !v.camels[me]}
          onClick={() =>
            setDraft({
              ...current,
              camelsOut:
                camelsOut >= Math.min(v.camels[me], 5) ? 0 : camelsOut + 1,
            })
          }
          aria-label={`驼队 ${v.camels[me]} 头${camelsOut ? `，换出 ${camelsOut} 头` : ''}（点击增加换出的骆驼）`}
        >
          <Ware c={CAMEL} small />
          <span>
            驼队 {v.camels[me]}
            {camelsOut ? <em> 换出 {camelsOut}</em> : null}
          </span>
        </button>
        <fieldset className="bz-hand" aria-label="你的货">
          {v.hand.map((c, i) => (
            <button
              key={`${i}-${c}`}
              type="button"
              className={`bz-slot${give.includes(i) ? ' is-selected' : ''}`}
              disabled={!live}
              aria-pressed={give.includes(i)}
              aria-label={`手牌第 ${i + 1} 件：${cardLabel(c)}`}
              onClick={() => toggle('give', i)}
            >
              <Ware c={c} />
            </button>
          ))}
          {!v.hand.length && <span className="kit-help">手里没有货</span>}
        </fieldset>
      </div>
      <div className="bz-who is-me">
        <strong>{names[me]}</strong>
        <span>货 {v.hand.length}/7</span>
        <span>银两 {pts(v, me)}</span>
        <span className="bz-seals" aria-label={`市舶印 ${v.seals[me]} 枚`}>
          {[0, 1].map((k) => (
            <i key={k} className={k < v.seals[me] ? 'is-on' : ''} />
          ))}
        </span>
      </div>
      {footer}
    </div>
  );
}
