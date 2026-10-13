/**
 * 轻量 0x88 搜索引擎：只用于 AI 思考（伪合法走法 + 走后自检将军），
 * 规则判定与记谱仍由 chess.js 负责。比直接用 chess.js 搜索快两个数量级。
 */
// Pieces: 1 P, 2 N, 3 B, 4 R, 5 Q, 6 K; white positive, black negative.
const P = 1,
  N = 2,
  B = 3,
  R = 4,
  Q = 5,
  K = 6;
const CHARS = ' pnbrqk';
const KNIGHT = [-33, -31, -18, -14, 14, 18, 31, 33];
const KING = [-17, -16, -15, -1, 1, 15, 16, 17];
const BISHOP = [-17, -15, 15, 17];
const ROOK = [-16, -1, 1, 16];
// Castling bits: 1 white king side, 2 white queen side, 4 black king side, 8 black queen side.
const CASTLE_MASK = new Uint8Array(128).fill(15);
CASTLE_MASK[0x74] = 15 & ~3; // e1
CASTLE_MASK[0x77] = 15 & ~1; // h1
CASTLE_MASK[0x70] = 15 & ~2; // a1
CASTLE_MASK[0x04] = 15 & ~12; // e8
CASTLE_MASK[0x07] = 15 & ~4; // h8
CASTLE_MASK[0x00] = 15 & ~8; // a8

export const VALUE = [0, 100, 320, 330, 500, 900, 0];
// a8..h8 first, as in the usual printed tables, from White's view.
const PST_RAW: number[][] = [
  [],
  [
    0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30,
    20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5,
    -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0,
    0,
  ],
  [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30,
    0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20,
    20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20,
    -40, -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0,
    5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10,
    0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20,
    -10, -10, -10, -10, -10, -10, -20,
  ],
  [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0,
    -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0,
    0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0,
  ],
  [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5,
    5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5,
    5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10,
    -10, -20,
  ],
  [
    -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40,
    -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40,
    -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20,
    -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20,
  ],
  // 7: king endgame
  [
    -50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30,
    -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30,
    -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30,
    0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50,
  ],
];
const sq64 = (s: number) => (s >> 4) * 8 + (s & 7);
// Precomputed [piece][square0x88] for white; black uses the mirrored rank.
const PST_W: Int16Array[] = PST_RAW.map((t) => {
  const a = new Int16Array(128);
  if (t.length)
    for (let s = 0; s < 128; s++) if (!(s & 0x88)) a[s] = t[sq64(s)];
  return a;
});
const mirror = (s: number) => ((7 - (s >> 4)) << 4) | (s & 7);

export const MATE = 100000;

export class Engine {
  b = new Int8Array(128);
  side = 1; // 1 white, -1 black
  castle = 0;
  ep = -1;
  half = 0;
  kings = [0, 0]; // [white, black]
  private hist: number[] = [];
  nodes = 0;

  constructor(fen: string) {
    const [pos, side, castle, ep, half] = fen.split(' ');
    let r = 0,
      f = 0;
    for (const ch of pos) {
      if (ch === '/') {
        r++;
        f = 0;
      } else if (/\d/.test(ch)) f += Number(ch);
      else {
        const t = CHARS.indexOf(ch.toLowerCase());
        const s = (r << 4) | f;
        this.b[s] = ch === ch.toUpperCase() ? t : -t;
        if (t === K) this.kings[ch === 'K' ? 0 : 1] = s;
        f++;
      }
    }
    this.side = side === 'b' ? -1 : 1;
    this.castle =
      (castle.includes('K') ? 1 : 0) |
      (castle.includes('Q') ? 2 : 0) |
      (castle.includes('k') ? 4 : 0) |
      (castle.includes('q') ? 8 : 0);
    this.ep =
      ep && ep !== '-'
        ? ((8 - Number(ep[1])) << 4) | (ep.charCodeAt(0) - 97)
        : -1;
    this.half = Number(half) || 0;
  }

  attacked(s: number, by: number): boolean {
    const b = this.b;
    // Pawns
    const pd = by === 1 ? 16 : -16;
    for (const d of [pd - 1, pd + 1]) {
      const t = s + d;
      if (!(t & 0x88) && b[t] === by * P) return true;
    }
    for (const d of KNIGHT) {
      const t = s + d;
      if (!(t & 0x88) && b[t] === by * N) return true;
    }
    for (const d of KING) {
      const t = s + d;
      if (!(t & 0x88) && b[t] === by * K) return true;
    }
    for (const d of BISHOP) {
      for (let t = s + d; !(t & 0x88); t += d) {
        const p = b[t];
        if (p) {
          if (p === by * B || p === by * Q) return true;
          break;
        }
      }
    }
    for (const d of ROOK) {
      for (let t = s + d; !(t & 0x88); t += d) {
        const p = b[t];
        if (p) {
          if (p === by * R || p === by * Q) return true;
          break;
        }
      }
    }
    return false;
  }
  inCheck(side = this.side) {
    return this.attacked(this.kings[side === 1 ? 0 : 1], -side);
  }

  /** Pseudo-legal moves packed as from | to<<7 | promo<<14 | flag<<17 (1 ep, 2 castle, 3 double). */
  gen(capturesOnly = false): number[] {
    const out: number[] = [];
    const b = this.b;
    const me = this.side;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) {
        s += 7;
        continue;
      }
      const p = b[s] * me;
      if (p <= 0) continue;
      if (p === P) {
        const fwd = me === 1 ? -16 : 16;
        const startRank = me === 1 ? 6 : 1;
        const lastRank = me === 1 ? 0 : 7;
        const t = s + fwd;
        if (!(t & 0x88) && !b[t]) {
          if (t >> 4 === lastRank)
            for (const pr of [Q, N, R, B]) out.push(s | (t << 7) | (pr << 14));
          else if (!capturesOnly) {
            out.push(s | (t << 7));
            const t2 = t + fwd;
            if (s >> 4 === startRank && !b[t2])
              out.push(s | (t2 << 7) | (3 << 17));
          }
        }
        for (const d of [fwd - 1, fwd + 1]) {
          const c = s + d;
          if (c & 0x88) continue;
          if (b[c] * me < 0) {
            if (c >> 4 === lastRank)
              for (const pr of [Q, N, R, B])
                out.push(s | (c << 7) | (pr << 14));
            else out.push(s | (c << 7));
          } else if (c === this.ep) out.push(s | (c << 7) | (1 << 17));
        }
        continue;
      }
      if (p === N || p === K) {
        for (const d of p === N ? KNIGHT : KING) {
          const t = s + d;
          if (t & 0x88) continue;
          const q = b[t] * me;
          if (q > 0) continue;
          if (capturesOnly && !q) continue;
          out.push(s | (t << 7));
        }
        if (p === K && !capturesOnly) this.genCastle(s, out);
        continue;
      }
      const dirs = p === B ? BISHOP : p === R ? ROOK : KING;
      for (const d of dirs) {
        for (let t = s + d; !(t & 0x88); t += d) {
          const q = b[t] * me;
          if (q > 0) break;
          if (q < 0) {
            out.push(s | (t << 7));
            break;
          }
          if (!capturesOnly) out.push(s | (t << 7));
        }
      }
    }
    return out;
  }
  private genCastle(s: number, out: number[]) {
    const me = this.side;
    const b = this.b;
    const home = me === 1 ? 0x74 : 0x04;
    if (s !== home || this.attacked(s, -me)) return;
    const ks = me === 1 ? 1 : 4;
    const qs = me === 1 ? 2 : 8;
    if (
      this.castle & ks &&
      !b[s + 1] &&
      !b[s + 2] &&
      !this.attacked(s + 1, -me)
    )
      out.push(s | ((s + 2) << 7) | (2 << 17));
    if (
      this.castle & qs &&
      !b[s - 1] &&
      !b[s - 2] &&
      !b[s - 3] &&
      !this.attacked(s - 1, -me)
    )
      out.push(s | ((s - 2) << 7) | (2 << 17));
  }

  /** Make a move; returns false (and restores) if it leaves our king in check. */
  make(m: number): boolean {
    const b = this.b;
    const from = m & 127,
      to = (m >> 7) & 127,
      promo = (m >> 14) & 7,
      flag = m >> 17;
    const piece = b[from];
    const me = this.side;
    let captured = b[to];
    let capSq = to;
    if (flag === 1) {
      capSq = to + (me === 1 ? 16 : -16);
      captured = b[capSq];
      b[capSq] = 0;
    }
    this.hist.push(m, captured, capSq, this.castle, this.ep, this.half);
    b[to] = promo ? promo * me : piece;
    b[from] = 0;
    if (flag === 2) {
      const [rf, rt] = to > from ? [from + 3, from + 1] : [from - 4, from - 1];
      b[rt] = b[rf];
      b[rf] = 0;
    }
    if (piece * me === K) this.kings[me === 1 ? 0 : 1] = to;
    this.castle &= CASTLE_MASK[from] & CASTLE_MASK[to];
    this.ep = flag === 3 ? (from + to) >> 1 : -1;
    this.half = captured || piece * me === P ? 0 : this.half + 1;
    this.side = -me;
    if (this.attacked(this.kings[me === 1 ? 0 : 1], -me)) {
      this.unmake();
      return false;
    }
    return true;
  }
  unmake() {
    const h = this.hist;
    const half = h.pop()!,
      ep = h.pop()!,
      castle = h.pop()!,
      capSq = h.pop()!,
      captured = h.pop()!,
      m = h.pop()!;
    const b = this.b;
    const from = m & 127,
      to = (m >> 7) & 127,
      promo = (m >> 14) & 7,
      flag = m >> 17;
    const me = -this.side;
    this.side = me;
    b[from] = promo ? P * me : b[to];
    b[to] = 0;
    b[capSq] = captured;
    if (flag === 2) {
      const [rf, rt] = to > from ? [from + 3, from + 1] : [from - 4, from - 1];
      b[rf] = b[rt];
      b[rt] = 0;
    }
    if (b[from] * me === K) this.kings[me === 1 ? 0 : 1] = from;
    this.castle = castle;
    this.ep = ep;
    this.half = half;
  }

  evaluate(): number {
    const b = this.b;
    let score = 0;
    let heavy = 0;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) {
        s += 7;
        continue;
      }
      const p = b[s];
      if (p && Math.abs(p) !== P && Math.abs(p) !== K)
        heavy += VALUE[Math.abs(p)];
    }
    const endgame = heavy <= 1600;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) {
        s += 7;
        continue;
      }
      const p = b[s];
      if (!p) continue;
      const t = Math.abs(p);
      const table = t === K && endgame ? 7 : t;
      if (p > 0) score += VALUE[t] + PST_W[table][s];
      else score -= VALUE[t] + PST_W[table][mirror(s)];
    }
    if (endgame && Math.abs(score) > 300) {
      // Mop-up: drive the weaker king to the edge, bring ours closer.
      const [wk, bk] = this.kings;
      const loser = score > 0 ? bk : wk;
      const lr = loser >> 4,
        lf = loser & 7;
      const centre = Math.max(3 - lr, lr - 4) + Math.max(3 - lf, lf - 4);
      const dist =
        Math.abs((wk >> 4) - (bk >> 4)) + Math.abs((wk & 7) - (bk & 7));
      const mop = 10 * centre + 4 * (14 - dist);
      score += score > 0 ? mop : -mop;
    }
    return score * this.side;
  }

  moveKey(m: number) {
    const sq = (s: number) =>
      String.fromCharCode(97 + (s & 7)) + (8 - (s >> 4));
    const promo = (m >> 14) & 7;
    return sq(m & 127) + sq((m >> 7) & 127) + (promo ? CHARS[promo] : '');
  }
  captureScore(m: number) {
    const to = (m >> 7) & 127;
    const flag = m >> 17;
    const victim = flag === 1 ? P : Math.abs(this.b[to]);
    const promo = (m >> 14) & 7;
    if (!victim && !promo) return 0;
    return (
      10 * VALUE[victim] -
      VALUE[Math.abs(this.b[m & 127])] +
      10000 +
      (promo ? VALUE[promo] : 0)
    );
  }
}
