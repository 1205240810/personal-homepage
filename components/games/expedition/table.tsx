'use client';

import { useRef, useState, type ReactNode } from 'react';
import {
  ROUTES,
  ROUTE_INFO,
  canPlay,
  cardName,
  isWager,
  routeOf,
  routeScore,
  valueOf,
  type ExpeditionView,
  type Move,
  type Side,
} from '@/lib/games/expedition';
import { RouteArt } from './art';
import './expedition.css';

// CSS, inline SVG and text form a single illustrated card.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */
export function Card({
  c,
  small,
  className = '',
}: {
  c: number;
  small?: boolean;
  className?: string;
}) {
  const r = routeOf(c);
  return (
    <span
      className={`ex-card r${r}${small ? ' is-small' : ''}${isWager(c) ? ' is-wager' : ''} ${className}`}
      role="img"
      aria-label={cardName(c)}
    >
      <RouteArt r={r} wager={isWager(c)} />
      <b>{isWager(c) ? '契' : valueOf(c)}</b>
      <i aria-hidden="true">{ROUTE_INFO[r].glyph}</i>
    </span>
  );
}

/* oxlint-enable jsx-a11y/prefer-tag-over-role */

function Lane({
  cards,
  side,
  label,
  glow,
}: {
  cards: number[];
  side: 'me' | 'opp';
  label: string;
  glow?: boolean;
}) {
  const score = routeScore(cards);
  return (
    <div
      className={`ex-lane is-${side}${glow ? ' is-glow' : ''}`}
      aria-label={label}
    >
      {cards.length ? (
        <>
          <span className="ex-stack">
            {cards.map((c) => (
              <Card key={c} c={c} small />
            ))}
          </span>
          <span
            key={score}
            className={`ex-lane-score${score < 0 ? ' is-neg' : ''}`}
          >
            {score > 0 ? `+${score}` : score}
          </span>
        </>
      ) : (
        <span className="ex-lane-empty" aria-hidden="true" />
      )}
    </div>
  );
}

/**
 * 丝路远行牌桌：上方对手五路、中间五处驿站（弃牌）与牌堆、下方我方五路与手牌。
 * 先点手牌，再点「出到商路」或「弃到驿站」；之后点牌堆或某处驿站摸牌。
 */
export function ExpeditionTable({
  v,
  disabled,
  names,
  onMove,
  status,
  footer,
  positionKey,
}: {
  v: ExpeditionView;
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
    v.routes,
    v.discard,
    v.deckCount,
    !!disabled,
  ]);
  const empty = (generation: number) => ({
    position,
    generation,
    sel: null as number | null,
    sending: false,
  });
  const [draft, setDraft] = useState(() => empty(0));
  let current = draft;
  if (draft.position !== position) {
    current = empty(draft.generation + 1);
    setDraft(current);
  }
  const { sel, sending, generation } = current;
  const submitted = useRef<number | null>(null);
  const myTurn =
    !disabled &&
    !sending &&
    v.you !== null &&
    v.toPlay === me &&
    (v.phase === 'play' || v.phase === 'draw');
  const playing = myTurn && v.phase === 'play';
  const drawing = myTurn && v.phase === 'draw';
  const selected = playing && sel !== null && v.hand.includes(sel) ? sel : null;
  const playable =
    selected !== null && canPlay(v.routes[me][routeOf(selected)], selected);
  const lastCard = v.last && v.last.move.t !== 'draw' ? v.last.move.card : null;
  const act = (m: Move) => {
    if (!myTurn || submitted.current === generation) return;
    submitted.current = generation;
    if (onMove(m) === false) {
      submitted.current = null;
      return;
    }
    setDraft({ ...empty(generation), sending: true });
  };
  return (
    <div className="ex-table">
      <div className="ex-who is-opp">
        <strong>{names[opp]}</strong>
        <span
          className="ex-back-fan"
          aria-label={`手牌 ${v.handCounts[opp]} 张`}
        >
          {Array.from({ length: v.handCounts[opp] }, (_, k) => (
            <i key={k} />
          ))}
        </span>
        <span>本轮 {v.routes[opp].reduce((a, r) => a + routeScore(r), 0)}</span>
        <span>总分 {v.totals[opp]}</span>
      </div>
      <div className="ex-grid">
        {Array.from({ length: ROUTES }, (_, r) => (
          <Lane
            key={`o${r}`}
            cards={v.routes[opp][r]}
            side="opp"
            label={`${names[opp]} · ${ROUTE_INFO[r].name}路`}
            glow={
              lastCard !== null &&
              v.last?.side === opp &&
              v.last.move.t === 'play' &&
              routeOf(lastCard) === r
            }
          />
        ))}
        {Array.from({ length: ROUTES }, (_, r) => {
          const pile = v.discard[r];
          const top = pile[pile.length - 1];
          const canDraw = drawing && pile.length > 0 && r !== v.justDiscarded;
          const canDrop = selected !== null && routeOf(selected) === r;
          return (
            <button
              key={`d${r}`}
              type="button"
              className={`ex-post r${r}${canDraw ? ' can-draw' : ''}${canDrop ? ' can-drop' : ''}`}
              disabled={!canDraw && !canDrop}
              aria-label={`${ROUTE_INFO[r].name}驿站（${pile.length} 张）${top !== undefined ? `，顶牌${cardName(top)}` : ''}${canDraw ? '：摸这张' : canDrop ? '：弃到这里' : ''}`}
              onClick={() =>
                canDraw
                  ? act({ t: 'draw', from: r })
                  : canDrop &&
                    selected !== null &&
                    act({ t: 'discard', card: selected })
              }
            >
              <span className="ex-post-name">{ROUTE_INFO[r].name}</span>
              {top !== undefined ? (
                <Card key={top} c={top} className="is-landed" />
              ) : (
                <span className="ex-post-empty">{ROUTE_INFO[r].glyph}</span>
              )}
              {pile.length > 1 && (
                <span className="ex-post-count">{pile.length}</span>
              )}
            </button>
          );
        })}
        {Array.from({ length: ROUTES }, (_, r) => (
          <Lane
            key={`m${r}`}
            cards={v.routes[me][r]}
            side="me"
            label={`${names[me]} · ${ROUTE_INFO[r].name}路`}
          />
        ))}
      </div>
      <div className="ex-who is-me">
        <strong>{names[me]}</strong>
        <span>本轮 {v.routes[me].reduce((a, r) => a + routeScore(r), 0)}</span>
        <span>总分 {v.totals[me]}</span>
        <button
          type="button"
          className={`ex-deck${drawing && v.deckCount ? ' can-draw' : ''}`}
          disabled={!drawing || !v.deckCount}
          data-shortcut="d"
          onClick={() => act({ t: 'draw', from: 'deck' })}
          aria-label={`牌堆剩 ${v.deckCount} 张${drawing ? '：从牌堆摸牌' : ''}`}
        >
          <span className="ex-deck-stack" aria-hidden="true" />
          <span>牌堆 {v.deckCount}</span>
        </button>
      </div>
      {status && (
        <p className="ex-status" aria-live="polite">
          {status}
        </p>
      )}
      <fieldset className="ex-hand" aria-label="你的手牌">
        {v.hand.map((c) => {
          const can = canPlay(v.routes[me][routeOf(c)], c);
          return (
            <button
              key={c}
              type="button"
              className={`ex-hand-card${selected === c ? ' is-selected' : ''}${playing && !can ? ' is-dead' : ''}`}
              disabled={!playing}
              aria-pressed={selected === c}
              aria-label={cardName(c)}
              onClick={() =>
                setDraft({ ...current, sel: selected === c ? null : c })
              }
            >
              <Card c={c} />
            </button>
          );
        })}
      </fieldset>
      {selected !== null && (
        <div className="ex-actions kit-row">
          <button
            type="button"
            className="kit-primary"
            data-shortcut="p"
            disabled={!playable}
            onClick={() => act({ t: 'play', card: selected })}
          >
            出到{ROUTE_INFO[routeOf(selected)].name}路
          </button>
          <button
            type="button"
            data-shortcut="x"
            onClick={() => act({ t: 'discard', card: selected })}
          >
            弃到{ROUTE_INFO[routeOf(selected)].name}驿站
          </button>
          {!playable && (
            <span className="kit-help">
              {isWager(selected)
                ? '这条路已经起程，投契只能在开路前出'
                : '面值必须高于这条路已出的最大牌'}
            </span>
          )}
        </div>
      )}
      {footer}
    </div>
  );
}
