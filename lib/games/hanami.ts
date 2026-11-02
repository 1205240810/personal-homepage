// 花街七席：两人卡牌对局（原创主题与文字）。
//
// 花街茶楼里坐着七位宾客，分值 2、2、2、3、3、4、5。手牌是礼物：每位宾客只喜欢
// 一种礼物，这种礼物的张数等于其分值，共 21 张。
// 每轮：洗牌后暗抽 1 张不用，各发 6 张；双方轮流，每回合先摸 1 张，再从四种行动中
// 选一种尚未用过的：
//   藏 —— 暗置 1 张，轮末才亮出，计入自己；
//   舍 —— 暗弃 2 张，本轮不计分；
//   赠 —— 亮出 3 张，对手挑 1 张归对手，其余 2 张归自己；
//   比 —— 亮出两组各 2 张，对手挑一组归对手，另一组归自己。
// 双方各用完四种行动（共 8 回合）后亮出藏牌，逐位比较：送出礼物多者得到这位宾客的
// 青睐（彩绸）；持平则彩绸留在原处。得到 4 位宾客青睐或青睐分值合计 ≥ 11 即获胜
// （同时满足时分值优先）。最多 3 轮；3 轮后仍无人达标，按分值、再按人数比较。
export const VALUES = [2, 2, 2, 3, 3, 4, 5] as const;
/** 宾客身份（短名）。 */
export const PATRONS = [
  '琴师',
  '书生',
  '隐士',
  '画师',
  '舞者',
  '剑客',
  '名伶',
] as const;
/** 宾客全称。 */
export const PATRON_TITLES = [
  '琴师 素音',
  '书生 子衿',
  '隐士 松翁',
  '画师 青岚',
  '舞者 绯衣',
  '剑客 霜行',
  '名伶 云裳',
] as const;
/** 每位宾客偏爱的礼物；手牌就是这些礼物。名字与宾客不重字。 */
export const GIFTS = [
  '冰弦',
  '徽墨',
  '团茶',
  '纨扇',
  '玉簪',
  '酒壶',
  '明珠',
] as const;
/** 礼物单字，用在牌面与日志里。 */
export const GIFT_GLYPHS = ['弦', '墨', '茶', '扇', '簪', '酒', '珠'] as const;
export const ACTIONS = ['secret', 'discard', 'gift', 'contest'] as const;
export type ActionKind = (typeof ACTIONS)[number];
export const ACTION_NAMES: Record<ActionKind, string> = {
  secret: '藏',
  discard: '舍',
  gift: '赠',
  contest: '比',
};
export const ACTION_SIZE: Record<ActionKind, number> = {
  secret: 1,
  discard: 2,
  gift: 3,
  contest: 4,
};
export const MAX_ROUNDS = 3;
export type Side = 0 | 1;
export type Card = number; // patron index 0..6

export type Move =
  | { type: 'secret'; cards: [Card] }
  | { type: 'discard'; cards: [Card, Card] }
  | { type: 'gift'; cards: [Card, Card, Card] }
  | { type: 'contest'; cards: [Card, Card, Card, Card] } // pairs [0,1] and [2,3]
  | { type: 'pick'; index: number }; // gift: card index 0..2; contest: pair 0..1

export type Offer = {
  kind: 'gift' | 'contest';
  from: Side;
  cards: Card[];
};

export type LogEntry =
  | { side: Side; kind: 'secret' | 'discard'; count: number }
  | { side: Side; kind: 'gift' | 'contest'; cards: Card[]; picked: Card[] };

export type RoundSummary = {
  round: number;
  secrets: [Card | null, Card | null];
  counts: [number[], number[]];
  favour: (Side | null)[];
};

export type HanamiResult = {
  winner: Side | null;
  reason: 'points' | 'patrons' | 'final';
  points: [number, number];
  patrons: [number, number];
};

export type HanamiState = {
  round: number;
  starter: Side;
  deck: Card[];
  removed: Card | null;
  hands: [Card[], Card[]];
  secret: [Card | null, Card | null];
  discarded: [Card[], Card[]];
  played: [number[], number[]]; // counts per patron in front of each side
  used: [ActionKind[], ActionKind[]];
  favour: (Side | null)[];
  toAct: Side;
  offer: Offer | null;
  phase: 'play' | 'respond' | 'round-end' | 'over';
  log: LogEntry[];
  summary: RoundSummary | null;
  result: HanamiResult | null;
};

export const other = (s: Side): Side => (s === 0 ? 1 : 0);
const zeros = () => [0, 0, 0, 0, 0, 0, 0];

export function fullDeck(): Card[] {
  const d: Card[] = [];
  VALUES.forEach((v, p) => {
    for (let i = 0; i < v; i++) d.push(p);
  });
  return d;
}

function shuffle<T>(a: T[], rng: () => number) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const sortCards = (h: Card[]) => h.sort((a, b) => a - b);

/** Deal a round. The starter draws at the start of their first turn. */
export function dealRound(
  prev: Pick<HanamiState, 'favour'> & { round: number },
  starter: Side,
  rng: () => number,
): HanamiState {
  const deck = shuffle(fullDeck(), rng);
  const removed = deck.pop()!;
  const hands: [Card[], Card[]] = [
    sortCards(deck.splice(-6)),
    sortCards(deck.splice(-6)),
  ];
  const s: HanamiState = {
    round: prev.round + 1,
    starter,
    deck,
    removed,
    hands,
    secret: [null, null],
    discarded: [[], []],
    played: [zeros(), zeros()],
    used: [[], []],
    favour: prev.favour.slice(),
    toAct: starter,
    offer: null,
    phase: 'play',
    log: [],
    summary: null,
    result: null,
  };
  draw(s);
  return s;
}

export function newGame(rng: () => number, starter: Side = 0): HanamiState {
  return dealRound({ round: 0, favour: Array(7).fill(null) }, starter, rng);
}

function draw(s: HanamiState) {
  const c = s.deck.pop();
  if (c !== undefined) sortCards(s.hands[s.toAct]).push(c);
  sortCards(s.hands[s.toAct]);
}

function clone(s: HanamiState): HanamiState {
  return {
    ...s,
    deck: s.deck.slice(),
    hands: [s.hands[0].slice(), s.hands[1].slice()],
    secret: [...s.secret],
    discarded: [s.discarded[0].slice(), s.discarded[1].slice()],
    played: [s.played[0].slice(), s.played[1].slice()],
    used: [s.used[0].slice(), s.used[1].slice()],
    favour: s.favour.slice(),
    log: s.log.slice(),
    offer: s.offer && { ...s.offer, cards: s.offer.cards.slice() },
  };
}

/** Remove `cards` (patron indices, multiset) from hand; throws if missing. */
function take(hand: Card[], cards: readonly Card[]) {
  for (const c of cards) {
    const i = hand.indexOf(c);
    if (i < 0) throw new Error('手里没有这些礼物');
    hand.splice(i, 1);
  }
}

export function scoreOf(favour: readonly (Side | null)[], side: Side) {
  let points = 0;
  let patrons = 0;
  favour.forEach((f, p) => {
    if (f === side) {
      points += VALUES[p];
      patrons++;
    }
  });
  return { points, patrons };
}

function judge(
  favour: readonly (Side | null)[],
  final: boolean,
): HanamiResult | null {
  const a = scoreOf(favour, 0);
  const b = scoreOf(favour, 1);
  const points: [number, number] = [a.points, b.points];
  const patrons: [number, number] = [a.patrons, b.patrons];
  const p11 = [a.points >= 11, b.points >= 11];
  if (p11[0] !== p11[1])
    return { winner: p11[0] ? 0 : 1, reason: 'points', points, patrons };
  if (p11[0] && p11[1])
    return {
      winner: a.points > b.points ? 0 : 1,
      reason: 'points',
      points,
      patrons,
    };
  const f4 = [a.patrons >= 4, b.patrons >= 4];
  if (f4[0] !== f4[1])
    return { winner: f4[0] ? 0 : 1, reason: 'patrons', points, patrons };
  if (!final) return null;
  const winner =
    a.points !== b.points
      ? a.points > b.points
        ? 0
        : 1
      : a.patrons !== b.patrons
        ? a.patrons > b.patrons
          ? 0
          : 1
        : null;
  return { winner, reason: 'final', points, patrons };
}

function endTurn(s: HanamiState) {
  if (s.used[0].length === 4 && s.used[1].length === 4) {
    endRound(s);
    return;
  }
  s.toAct = other(s.toAct);
  s.phase = 'play';
  draw(s);
}

function endRound(s: HanamiState) {
  for (const side of [0, 1] as Side[]) {
    const c = s.secret[side];
    if (c !== null) s.played[side][c]++;
  }
  for (let p = 0; p < 7; p++) {
    if (s.played[0][p] > s.played[1][p]) s.favour[p] = 0;
    else if (s.played[1][p] > s.played[0][p]) s.favour[p] = 1;
  }
  s.summary = {
    round: s.round,
    secrets: [...s.secret],
    counts: [s.played[0].slice(), s.played[1].slice()],
    favour: s.favour.slice(),
  };
  s.result = judge(s.favour, s.round >= MAX_ROUNDS);
  s.phase = s.result ? 'over' : 'round-end';
  s.offer = null;
}

/** Whose decision is pending right now (actor, or responder to an offer). */
export const decider = (s: HanamiState): Side | null =>
  s.phase === 'play'
    ? s.toAct
    : s.phase === 'respond'
      ? other(s.offer!.from)
      : null;

export function apply(prev: HanamiState, side: Side, move: Move): HanamiState {
  if (decider(prev) !== side) throw new Error('还没轮到你');
  const s = clone(prev);
  if (s.phase === 'respond') {
    if (move.type !== 'pick') throw new Error('请先回应对方的出牌');
    const o = s.offer!;
    const giver = o.from;
    let mine: Card[];
    let theirs: Card[];
    if (o.kind === 'gift') {
      if (!Number.isInteger(move.index) || move.index < 0 || move.index > 2)
        throw new Error('只能挑一张');
      mine = [o.cards[move.index]];
      theirs = o.cards.filter((_, i) => i !== move.index);
    } else {
      if (move.index !== 0 && move.index !== 1) throw new Error('只能挑一组');
      mine = o.cards.slice(move.index * 2, move.index * 2 + 2);
      theirs = o.cards.slice((1 - move.index) * 2, (1 - move.index) * 2 + 2);
    }
    for (const c of mine) s.played[side][c]++;
    for (const c of theirs) s.played[giver][c]++;
    s.log.push({
      side: giver,
      kind: o.kind,
      cards: o.cards.slice(),
      picked: mine,
    });
    s.offer = null;
    s.toAct = giver;
    endTurn(s);
    return s;
  }
  if (s.phase !== 'play') throw new Error('这一轮已经结束');
  if (move.type === 'pick') throw new Error('现在不能挑牌');
  if (!ACTIONS.includes(move.type)) throw new Error('未知行动');
  if (s.used[side].includes(move.type)) throw new Error('这个行动本轮已经用过');
  const cards = move.cards as Card[];
  if (!Array.isArray(cards) || cards.length !== ACTION_SIZE[move.type])
    throw new Error(
      `${ACTION_NAMES[move.type]}需要 ${ACTION_SIZE[move.type]} 张`,
    );
  if (cards.some((c) => !Number.isInteger(c) || c < 0 || c > 6))
    throw new Error('礼物无效');
  take(s.hands[side], cards);
  s.used[side].push(move.type);
  if (move.type === 'secret') {
    s.secret[side] = cards[0];
    s.log.push({ side, kind: 'secret', count: 1 });
    endTurn(s);
  } else if (move.type === 'discard') {
    s.discarded[side] = cards.slice();
    s.log.push({ side, kind: 'discard', count: 2 });
    endTurn(s);
  } else {
    s.offer = { kind: move.type, from: side, cards: cards.slice() };
    s.phase = 'respond';
  }
  return s;
}

/** Start the next round after a round-end summary. */
export function nextRound(s: HanamiState, rng: () => number): HanamiState {
  if (s.phase !== 'round-end') throw new Error('这一轮还没结束');
  return dealRound(s, other(s.starter), rng);
}

// ---- What one side may see ----
export type HanamiView = {
  you: Side | null;
  round: number;
  starter: Side;
  phase: HanamiState['phase'];
  toAct: Side;
  decider: Side | null;
  hand: Card[]; // your own hand (empty for spectators)
  handCounts: [number, number];
  deckCount: number;
  played: [number[], number[]];
  used: [ActionKind[], ActionKind[]];
  /** Your own secret card; the opponent's is only a boolean until round end. */
  mySecret: Card | null;
  mySecretDiscards: Card[];
  hasSecret: [boolean, boolean];
  favour: (Side | null)[];
  offer: Offer | null;
  log: LogEntry[];
  summary: RoundSummary | null;
  result: HanamiResult | null;
};

export function viewFor(s: HanamiState, side: Side | null): HanamiView {
  return {
    you: side,
    round: s.round,
    starter: s.starter,
    phase: s.phase,
    toAct: s.toAct,
    decider: decider(s),
    hand: side === null ? [] : s.hands[side].slice(),
    handCounts: [s.hands[0].length, s.hands[1].length],
    deckCount: s.deck.length,
    played: [s.played[0].slice(), s.played[1].slice()],
    used: [s.used[0].slice(), s.used[1].slice()],
    mySecret: side === null ? null : s.secret[side],
    mySecretDiscards: side === null ? [] : s.discarded[side].slice(),
    hasSecret: [s.secret[0] !== null, s.secret[1] !== null],
    favour: s.favour.slice(),
    offer: s.offer && { ...s.offer, cards: s.offer.cards.slice() },
    log: s.log.map((l) => ({ ...l })),
    // Round summary reveals both secrets, but never discards or the removed card.
    summary: s.summary && {
      ...s.summary,
      secrets: [...s.summary.secrets],
      counts: [s.summary.counts[0].slice(), s.summary.counts[1].slice()],
      favour: s.summary.favour.slice(),
    },
    result: s.result,
  };
}
