'use client';

import { useCallback, useRef, useState } from 'react';
import {
  ACTIONS,
  ACTION_NAMES,
  ACTION_SIZE,
  GIFTS,
  PATRONS,
  PATRON_TITLES,
  VALUES,
  scoreOf,
  type ActionKind,
  type Card,
  type HanamiView,
  type LogEntry,
  type Move,
  type Side,
} from '@/lib/games/hanami';
import { GiftIcon, GuestPortrait, Ribbon } from './art';
import './hanami.css';

const ACTION_HELP: Record<ActionKind, string> = {
  secret: '藏起 1 份礼物，轮末亮出算你送的',
  discard: '悄悄舍掉 2 份礼物，本轮谁也不算',
  gift: '奉上 3 份礼物，对方先挑 1 份抢走，其余 2 份算你送的',
  contest: '摆出两盘各 2 份礼物，对方挑走一盘，另一盘算你送的',
};

export function Blossom({
  c,
  small,
  back,
}: {
  c?: Card;
  small?: boolean;
  back?: boolean;
}) {
  if (back || c === undefined)
    return (
      <span
        className={`hn-card is-back${small ? ' is-small' : ''}`}
        aria-label="礼盒背面"
      />
    );
  return (
    <span
      className={`hn-card hn-p${c}${small ? ' is-small' : ''}`}
      aria-label={`${GIFTS[c]}（${PATRON_TITLES[c]}偏爱，${VALUES[c]} 分）`}
    >
      <GiftIcon g={c} className="hn-gift-art" />
      <b aria-hidden="true">{GIFTS[c]}</b>
      <i aria-hidden="true">{VALUES[c]}</i>
    </span>
  );
}

function Tokens({
  used,
  mine,
  active,
  onPick,
}: {
  used: ActionKind[];
  mine?: boolean;
  active?: ActionKind | null;
  onPick?: (a: ActionKind) => void;
}) {
  return (
    <div
      className="hn-tokens"
      role={mine ? 'toolbar' : undefined}
      aria-label={mine ? '选择行动' : '对手行动'}
    >
      {ACTIONS.map((a) => {
        const done = used.includes(a);
        return mine ? (
          <button
            key={a}
            type="button"
            className={`hn-token${done ? ' is-used' : ''}${active === a ? ' is-active' : ''}`}
            disabled={done || !onPick}
            aria-pressed={active === a}
            title={ACTION_HELP[a]}
            onClick={() => onPick?.(a)}
          >
            <b>{ACTION_NAMES[a]}</b>
            <small>{ACTION_SIZE[a]}</small>
          </button>
        ) : (
          <span
            key={a}
            className={`hn-token${done ? ' is-used' : ''}`}
            title={ACTION_HELP[a]}
          >
            <b>{ACTION_NAMES[a]}</b>
          </span>
        );
      })}
    </div>
  );
}

function Pips({ n, p, side }: { n: number; p: number; side: 'me' | 'opp' }) {
  return (
    <span className={`hn-pips is-${side}`} aria-label={`${n} 份`}>
      {Array.from({ length: n }, (_, i) => (
        <i key={i} className={`hn-p${p}`}>
          <GiftIcon g={p} />
        </i>
      ))}
    </span>
  );
}

function logText(l: LogEntry, me: Side) {
  const who = l.side === me ? '你' : '对方';
  if (!('cards' in l))
    return `${who}${l.kind === 'secret' ? '藏起 1 份礼物' : '舍掉 2 份礼物'}`;
  const names = (cs: Card[]) => cs.map((c) => GIFTS[c]).join('、');
  return `${who}${l.kind === 'gift' ? '奉上' : '摆出'} ${names(l.cards)}，${l.side === me ? '对方' : '你'}抢走 ${names(l.picked)}`;
}

type TableProps = {
  v: HanamiView;
  names: [string, string];
  /** false releases the submission guard for a rejected or server-owned move. */
  onMove: (m: Move) => void | boolean;
  thinking?: string | null;
  footer?: React.ReactNode;
  disabled?: boolean;
};

export function HanamiTable(props: TableProps) {
  const { v, disabled } = props;
  // Selections refer to indices in one visible position. A new hand, response,
  // round, seat or connection state must never reuse those indices.
  const position = JSON.stringify([
    v.you,
    v.round,
    v.phase,
    v.toAct,
    v.decider,
    v.hand,
    v.used,
    v.offer,
    !!disabled,
  ]);
  return <HanamiPosition key={position} {...props} />;
}

function HanamiPosition({
  v,
  names,
  onMove,
  thinking,
  footer,
  disabled = false,
}: TableProps) {
  const me: Side = v.you ?? 0;
  const opp: Side = me === 0 ? 1 : 0;
  const [action, setAction] = useState<ActionKind | null>(null);
  const [sel, setSel] = useState<number[]>([]);
  const submitted = useRef(false);
  const [sending, setSending] = useState(false);
  const myTurn =
    !disabled &&
    !sending &&
    v.you !== null &&
    v.phase === 'play' &&
    v.decider === me;
  const responding =
    !disabled &&
    !sending &&
    v.you !== null &&
    v.phase === 'respond' &&
    v.decider === me;
  const need = action ? ACTION_SIZE[action] : 0;
  const reset = () => {
    setAction(null);
    setSel([]);
  };
  const toggle = (i: number) => {
    if (!myTurn || !action) return;
    setSel((s) =>
      s.includes(i)
        ? s.filter((x) => x !== i)
        : s.length < need
          ? [...s, i]
          : s,
    );
  };
  const submit = useCallback(
    (move: Move) => {
      if (disabled || submitted.current) return;
      submitted.current = true;
      setSending(true);
      if (onMove(move) === false) {
        submitted.current = false;
        setSending(false);
        return;
      }
      setAction(null);
      setSel([]);
    },
    [disabled, onMove],
  );
  const confirm = () => {
    if (!myTurn || !action || sel.length !== need) return;
    submit({ type: action, cards: sel.map((i) => v.hand[i]) } as Move);
  };
  const choose = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (responding)
      submit({
        type: 'pick',
        index: Number(event.currentTarget.dataset.index),
      });
  };
  const sMe = scoreOf(v.favour, me);
  const sOpp = scoreOf(v.favour, opp);
  const status = thinking
    ? thinking
    : sending
      ? '已提交，等待牌局更新…'
      : v.phase === 'respond'
        ? responding
          ? v.offer!.kind === 'gift'
            ? '对方奉上 3 份礼物：抢 1 份，替你送出'
            : '对方摆出两盘礼物：挑走一盘'
          : '等对方挑礼物…'
        : v.phase === 'play'
          ? myTurn
            ? action
              ? `${ACTION_NAMES[action]}：选 ${need} 份礼物${action === 'contest' ? '（前两份为甲盘，后两份为乙盘）' : ''}`
              : '轮到你：先选一种行动'
            : '等对方行动…'
          : '';
  const lastLog = v.log[v.log.length - 1];
  return (
    <div className="hn-table" aria-busy={sending}>
      <section className="hn-side is-opp" aria-label="对手">
        <div className="hn-who">
          <strong>{names[opp]}</strong>
          <span>
            {sOpp.patrons} 位 · {sOpp.points} 分
          </span>
        </div>
        <div
          className="hn-hand is-hidden"
          aria-label={`对手手里 ${v.handCounts[opp]} 份礼物`}
        >
          {Array.from({ length: v.handCounts[opp] }, (_, i) => (
            <Blossom key={i} back small />
          ))}
        </div>
        <Tokens used={v.used[opp]} />
        <div className="hn-hidden-info">
          {v.hasSecret[opp] && <span>藏 1 份</span>}
          {v.used[opp].includes('discard') && <span>舍 2 份</span>}
        </div>
      </section>

      <section className="hn-patrons" aria-label="七位宾客">
        {VALUES.map((val, p) => {
          const f = v.favour[p];
          return (
            <div
              key={p}
              className={`hn-col hn-p${p}${f === me ? ' is-mine' : f === opp ? ' is-theirs' : ''}`}
            >
              <Pips n={v.played[opp][p]} p={p} side="opp" />
              <div className="hn-patron">
                <Ribbon
                  className={`hn-marker${f === me ? ' to-me' : f === opp ? ' to-opp' : ''}`}
                />
                <GuestPortrait p={p} className="hn-portrait" />
                <b>{PATRONS[p]}</b>
                <small>{PATRON_TITLES[p].split(' ')[1]}</small>
                <span className="hn-likes">
                  <GiftIcon g={p} />
                  <i>{val}</i>
                </span>
              </div>
              <Pips n={v.played[me][p]} p={p} side="me" />
              <span className="hn-sr">
                {PATRON_TITLES[p]}（{val} 分，偏爱{GIFTS[p]}）：你送了{' '}
                {v.played[me][p]} 份，对手送了 {v.played[opp][p]} 份，彩绸
                {f === me ? '在你这边' : f === opp ? '在对手那边' : '还在中间'}
              </span>
            </div>
          );
        })}
      </section>

      <div className="hn-status" aria-live="polite">
        <span>
          第 {v.round} 轮 · 牌堆 {v.deckCount}
        </span>
        <strong>{status}</strong>
        {lastLog && <small>{logText(lastLog, me)}</small>}
      </div>

      {v.phase === 'respond' && v.offer && (
        <div
          className={`hn-offer${responding ? ' is-mine' : ''}`}
          aria-label="对方的出牌"
        >
          <span className="hn-offer-title">
            {v.offer.kind === 'gift' ? '礼盘 · 抢 1 份' : '两盘礼物 · 挑 1 盘'}
          </span>
          {v.offer.kind === 'gift'
            ? v.offer.cards.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  className="hn-pick"
                  aria-label={`选择${PATRON_TITLES[c]}（${VALUES[c]} 分），第 ${i + 1} 张`}
                  disabled={!responding}
                  data-index={i}
                  onClick={choose}
                >
                  <Blossom c={c} />
                </button>
              ))
            : [0, 1].map((i) => (
                <button
                  key={i}
                  type="button"
                  className="hn-pick is-pair"
                  aria-label={`选择第 ${i + 1} 组：${v
                    .offer!.cards.slice(i * 2, i * 2 + 2)
                    .map((c) => PATRON_TITLES[c])
                    .join(' / ')}`}
                  disabled={!responding}
                  data-index={i}
                  onClick={choose}
                >
                  <Blossom c={v.offer!.cards[i * 2]} />
                  <Blossom c={v.offer!.cards[i * 2 + 1]} />
                </button>
              ))}
        </div>
      )}

      {v.summary && (v.phase === 'round-end' || v.phase === 'over') && (
        <div className="hn-summary">
          <span>
            第 {v.summary.round} 轮结束 · 亮出藏起的礼物：你{' '}
            {v.summary.secrets[me] !== null
              ? GIFTS[v.summary.secrets[me]!]
              : '—'}
            ，对方{' '}
            {v.summary.secrets[opp] !== null
              ? GIFTS[v.summary.secrets[opp]!]
              : '—'}
          </span>
          <span>
            你 {sMe.patrons} 位 {sMe.points} 分 · 对方 {sOpp.patrons} 位{' '}
            {sOpp.points} 分
          </span>
        </div>
      )}
      {footer}

      <section className="hn-side is-me" aria-label="你">
        <div className="hn-who">
          <strong>{names[me]}</strong>
          <span>
            {sMe.patrons} 位 · {sMe.points} 分
          </span>
          {v.mySecret !== null && (
            <span className="hn-mine-hidden">
              藏 <Blossom c={v.mySecret} small />
            </span>
          )}
          {v.mySecretDiscards.length > 0 && (
            <span className="hn-mine-hidden">
              舍{' '}
              {v.mySecretDiscards.map((c, i) => (
                <Blossom key={i} c={c} small />
              ))}
            </span>
          )}
        </div>
        <Tokens
          used={v.used[me]}
          mine
          active={action}
          onPick={
            myTurn
              ? (a) => {
                  setAction(a === action ? null : a);
                  setSel([]);
                }
              : undefined
          }
        />
        <div className="hn-hand" aria-label="你的手牌">
          {v.hand.map((c, i) => {
            const k = sel.indexOf(i);
            return (
              <button
                key={i}
                type="button"
                className={`hn-slot${k >= 0 ? ' is-sel' : ''}${action === 'contest' && k >= 2 ? ' is-pair-b' : ''}`}
                disabled={!myTurn || !action}
                aria-label={`${PATRON_TITLES[c]}（${VALUES[c]} 分），第 ${i + 1} 张${action === 'contest' && k >= 0 ? (k < 2 ? '，甲组' : '，乙组') : ''}`}
                aria-pressed={k >= 0}
                onClick={() => toggle(i)}
              >
                <Blossom c={c} />
                {k >= 0 && action === 'contest' && (
                  <em>{k < 2 ? '甲' : '乙'}</em>
                )}
              </button>
            );
          })}
        </div>
        {myTurn && action && (
          <div className="hn-confirm">
            <span>{ACTION_HELP[action]}</span>
            <button type="button" onClick={reset}>
              取消
            </button>
            <button
              type="button"
              className="kit-primary"
              disabled={sel.length !== need}
              onClick={confirm}
            >
              确认{ACTION_NAMES[action]}（{sel.length}/{need}）
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
