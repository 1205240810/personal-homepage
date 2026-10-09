// Synced from standalone/stud/src by scripts/sync-standalone-games.mjs. Edit the standalone source.
import { initial, limits, type Game } from './engine';
export const SAVE_KEY = 'velvet-stud-v1';
export interface SavedGame {
  game: Game;
  resumed: boolean;
}
const integer = (n: unknown, min = 0, max = 1000): n is number =>
  Number.isInteger(n) && Number(n) >= min && Number(n) <= max;
const pair = (
  v: unknown,
  check: (n: unknown) => boolean,
): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && v.every((n) => check(n));
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max = 1000): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max;
const finite = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const texts = (v: unknown, max = 8): v is string[] =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.length <= max &&
  v.every((s) => text(s));
const cards = (v: unknown, size: number): v is number[] =>
  Array.isArray(v) &&
  v.length === size &&
  v.every((c) => integer(c, 0, 51)) &&
  new Set(v).size === v.length;
const onlyKeys = (v: Record<string, unknown>, keys: string[]) =>
  Object.keys(v).every((k) => keys.includes(k));
function validReview(x: unknown): boolean {
  if (
    !object(x) ||
    !integer(x.seat, 0, 1) ||
    !integer(x.street, 1, 4) ||
    typeof x.action !== 'string' ||
    x.action.length > 100 ||
    typeof x.reason !== 'string' ||
    x.reason.length > 1000 ||
    !finite(x.equity, 0, 1) ||
    !finite(x.odds, 0, 1)
  )
    return false;
  if (x.advice === undefined) return true; // v2 legacy review: retain, never fabricate diagnostics.
  const a = x.advice;
  if (
    !object(a) ||
    !onlyKeys(a, [
      'recommended',
      'rationale',
      'alternatives',
      'nextStep',
      'model',
      'call',
      'potAfterCall',
      'actualEV',
      'recommendedEV',
      'estimatedLoss',
      'samples',
      'rangeNote',
      'warnings',
      'snapshot',
    ])
  )
    return false;
  if (
    !text(a.recommended, 100) ||
    !texts(a.rationale) ||
    !text(a.nextStep) ||
    !text(a.model, 200) ||
    !text(a.rangeNote) ||
    !texts(a.warnings) ||
    !integer(a.call) ||
    !integer(a.potAfterCall) ||
    !integer(a.samples, 1, 10000) ||
    !finite(a.actualEV, -1000, 1000) ||
    !finite(a.recommendedEV, -1000, 1000) ||
    !finite(a.estimatedLoss, 0, 2000)
  )
    return false;
  if (
    !Array.isArray(a.alternatives) ||
    a.alternatives.length < 1 ||
    a.alternatives.length > 8 ||
    a.alternatives.some(
      (t) =>
        !object(t) ||
        !onlyKeys(t, ['label', 'reason', 'ev', 'paid']) ||
        !text(t.label, 100) ||
        !text(t.reason) ||
        !finite(t.ev, -1000, 1000) ||
        !integer(t.paid),
    )
  )
    return false;
  const alternatives = a.alternatives as {
    label: string;
    ev: number;
    paid: number;
  }[];
  if (
    new Set(alternatives.map((t) => t.label)).size !== alternatives.length ||
    !alternatives.some(
      (t) => t.label === a.recommended && t.ev === a.recommendedEV,
    ) ||
    !alternatives.some((t) => t.label === x.action && t.ev === a.actualEV)
  )
    return false;
  const s = a.snapshot;
  if (
    !object(s) ||
    !onlyKeys(s, ['own', 'exposed', 'pot', 'stack', 'opponentStack']) ||
    !cards(s.own, x.street + 1) ||
    !cards(s.exposed, x.street) ||
    new Set([...s.own, ...s.exposed]).size !==
      s.own.length + s.exposed.length ||
    !integer(s.pot) ||
    !integer(s.stack) ||
    !integer(s.opponentStack) ||
    s.pot + s.stack + s.opponentStack !== 1000 ||
    a.potAfterCall !== s.pot + a.call ||
    a.call > s.stack ||
    alternatives.some((t) => t.paid > Number(s.stack))
  )
    return false;
  return (
    Math.abs(a.estimatedLoss - Math.max(0, a.recommendedEV - a.actualEV)) <=
    0.11
  );
}
function validHistory(value: unknown, g: Game): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > 1000) return false;
  let street = 1;
  return value.every((h) => {
    if (
      !object(h) ||
      !onlyKeys(h, [
        'seat',
        'street',
        'action',
        'paid',
        'potBefore',
        'call',
        'exposed',
      ]) ||
      !integer(h.seat, 0, 1) ||
      !integer(h.street, street, g.street) ||
      !integer(h.paid) ||
      !integer(h.potBefore, 1) ||
      !integer(h.call) ||
      !object(h.action) ||
      !pair(h.exposed, (v) => Array.isArray(v))
    )
      return false;
    if (
      !['check', 'call', 'fold', 'raise'].includes(String(h.action.type)) ||
      !onlyKeys(h.action, h.action.type === 'raise' ? ['type', 'to'] : ['type'])
    )
      return false;
    if (
      (h.action.type === 'raise' &&
        (!integer(h.action.to, 1) ||
          h.action.to < h.paid ||
          h.paid <= h.call)) ||
      (h.action.type === 'call' && h.paid !== h.call) ||
      (['check', 'fold'].includes(String(h.action.type)) && h.paid !== 0) ||
      (h.action.type === 'check' && h.call !== 0)
    )
      return false;
    const exposed = h.exposed as unknown as [number[], number[]];
    if (
      !exposed.every(
        (a, i) =>
          cards(a, h.street as number) &&
          a.every((c, j) => c === g.cards[i][j + 1]),
      ) ||
      new Set(exposed.flat()).size !== h.street * 2
    )
      return false;
    street = h.street;
    return true;
  });
}
/** Treat storage as untrusted. A malformed snapshot must never reach the engine. */
export function validGame(x: unknown): x is Game {
  if (!x || typeof x !== 'object') return false;
  const g = x as Game;
  if (
    !integer(g.revision, 0, 1000000) ||
    !integer(g.hand, 0, 10) ||
    !integer(g.dealer, 0, 1) ||
    !integer(g.turn, 0, 1) ||
    !integer(g.street, 0, 4) ||
    !integer(g.minRaise, 1) ||
    !integer(g.pot) ||
    !integer(g.lastPot)
  )
    return false;
  if (
    !pair(g.stacks, integer) ||
    !pair(g.startStacks, integer) ||
    !pair(g.paid, integer) ||
    g.startStacks[0] + g.startStacks[1] !== 1000 ||
    g.stacks[0] + g.stacks[1] + g.pot !== 1000 ||
    g.paid[0] + g.paid[1] > g.pot
  )
    return false;
  if (
    !Array.isArray(g.acted) ||
    g.acted.length !== 2 ||
    g.acted.some((v) => typeof v !== 'boolean') ||
    typeof g.revealed !== 'boolean' ||
    ![null, 0, 1, 'tie'].includes(g.winner) ||
    typeof g.message !== 'string' ||
    g.message.length > 500
  )
    return false;
  if (
    !Array.isArray(g.logs) ||
    g.logs.length > 1000 ||
    g.logs.some((s) => typeof s !== 'string' || s.length > 500) ||
    !Array.isArray(g.reviews) ||
    g.reviews.length > 1000 ||
    g.reviews.some((r) => !validReview(r))
  )
    return false;
  if (
    !Array.isArray(g.cards) ||
    g.cards.length !== 2 ||
    g.cards.some((a) => !Array.isArray(a)) ||
    !Array.isArray(g.deck)
  )
    return false;
  const all = [...g.cards[0], ...g.cards[1], ...g.deck];
  if (all.some((c) => !integer(c, 0, 51)) || new Set(all).size !== all.length)
    return false;
  if (!validHistory(g.history, g)) return false;
  if (
    g.reviews.some(
      (r) =>
        r.street > g.street ||
        (r.advice &&
          (!r.advice.snapshot.own.every((c, j) => c === g.cards[r.seat][j]) ||
            !r.advice.snapshot.exposed.every(
              (c, j) => c === g.cards[1 - r.seat][j + 1],
            ))),
    )
  )
    return false;
  if (g.phase === 'ready')
    return (
      all.length === 0 &&
      g.street === 0 &&
      g.pot === 0 &&
      g.winner === null &&
      !g.revealed &&
      g.stacks.every((n, i) => n === g.startStacks[i]) &&
      g.paid.every((n) => n === 0)
    );
  if (
    !['betting', 'dealing', 'runout', 'complete'].includes(g.phase) ||
    g.hand === 0 ||
    all.length !== 52 ||
    g.cards[0].length !== g.cards[1].length ||
    g.cards[0].length !== g.street + 1 ||
    g.street < 1
  )
    return false;
  if (g.phase === 'complete')
    return (
      g.pot === 0 &&
      g.winner !== null &&
      (!g.revealed || g.cards[0].length === 5)
    );
  if (
    g.pot === 0 ||
    g.winner !== null ||
    g.revealed ||
    g.startStacks.some((s, i) => g.stacks[i] > s) ||
    g.paid.some((p, i) => p > g.startStacks[i] - g.stacks[i])
  )
    return false;
  if (
    g.phase === 'dealing' &&
    (g.street === 4 ||
      g.paid[0] !== g.paid[1] ||
      !g.acted.every(Boolean) ||
      g.stacks.some((s) => s === 0))
  )
    return false;
  if (
    g.phase === 'betting' &&
    (g.acted[g.turn] ||
      g.stacks[g.turn] === 0 ||
      (g.stacks[1 - g.turn] === 0 && limits(g).call === 0))
  )
    return false;
  if (
    g.phase === 'runout' &&
    (g.street === 4 ||
      g.paid[0] !== g.paid[1] ||
      !g.stacks.some((s) => s === 0))
  )
    return false;
  return (
    Math.max(...g.paid) <=
    Math.min(g.paid[0] + g.stacks[0], g.paid[1] + g.stacks[1])
  );
}
export function loadGame(persist: boolean): SavedGame {
  const fallback = { game: initial(), resumed: false };
  if (!persist) return fallback;
  try {
    const raw = localStorage.getItem(SAVE_KEY) || 'null';
    if (raw.length > 1000000) return fallback;
    const s = JSON.parse(raw);
    if (s?.v === 2 && validGame(s.game))
      return {
        game: s.game,
        resumed: !['ready', 'complete'].includes(s.game.phase),
      };
    if (
      s?.v === 1 &&
      pair(s.stacks, integer) &&
      s.stacks[0] + s.stacks[1] === 1000 &&
      integer(s.hand, 0, 10)
    )
      return { game: initial(s.stacks, s.hand), resumed: false };
  } catch {}
  return fallback;
}
export function saveGame(game: Game): boolean {
  try {
    if (!validGame(game)) return false;
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 2, game }));
    return true;
  } catch {
    return false;
  }
}
