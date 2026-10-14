/**
 * 轻量 0x88 搜索引擎：只用于 AI 思考（伪合法走法 + 走后自检将军 + Zobrist 哈希），
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
const PHASE = [0, 0, 1, 1, 2, 4, 0];
const MG_VALUE = [0, 82, 337, 365, 477, 1025, 0];
const EG_VALUE = [0, 94, 281, 297, 512, 936, 0];
const PASSED_MG = [0, 5, 10, 15, 30, 55, 90, 0];
const PASSED_EG = [0, 10, 20, 35, 60, 100, 160, 0];
const MOB_MG = [0, 0, 4, 5, 2, 1, 0];
const MOB_EG = [0, 0, 4, 5, 4, 2, 0];
const MOB_BASE = [0, 0, 4, 6, 6, 12, 0];
// Endgame pawn table: reward advancement.
const EG_PAWN = new Int16Array(128);
for (let s = 0; s < 128; s++)
  if (!(s & 0x88)) EG_PAWN[s] = [0, 90, 55, 32, 15, 5, 0, 0][s >> 4];

// Zobrist keys as two 32-bit halves (no BigInt in the hot path).
function zrand(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return x | 0;
  };
}
const zr = zrand(0x9e3779b9);
// index: (piece + 6) * 128 + square, piece in -6..6
const Z_PIECE_LO = new Int32Array(13 * 128).map(() => zr());
const Z_PIECE_HI = new Int32Array(13 * 128).map(() => zr());
const Z_SIDE_LO = zr();
const Z_SIDE_HI = zr();
const Z_CASTLE_LO = new Int32Array(16).map(() => zr());
const Z_CASTLE_HI = new Int32Array(16).map(() => zr());
const Z_EP_LO = new Int32Array(8).map(() => zr());
const Z_EP_HI = new Int32Array(8).map(() => zr());

export class Engine {
  b = new Int8Array(128);
  side = 1; // 1 white, -1 black
  castle = 0;
  ep = -1;
  half = 0;
  kings = [0, 0]; // [white, black]
  private hist: number[] = [];
  nodes = 0;
  hlo = 0;
  hhi = 0;
  /** Hash keys of earlier positions (for repetition detection), lo/hi interleaved. */
  keys: number[] = [];

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
    this.rehash();
  }

  rehash() {
    let lo = 0,
      hi = 0;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88 || !this.b[s]) continue;
      lo ^= Z_PIECE_LO[(this.b[s] + 6) * 128 + s];
      hi ^= Z_PIECE_HI[(this.b[s] + 6) * 128 + s];
    }
    if (this.side === -1) {
      lo ^= Z_SIDE_LO;
      hi ^= Z_SIDE_HI;
    }
    lo ^= Z_CASTLE_LO[this.castle];
    hi ^= Z_CASTLE_HI[this.castle];
    const epFile = this.hashEpFile();
    if (epFile >= 0) {
      lo ^= Z_EP_LO[epFile];
      hi ^= Z_EP_HI[epFile];
    }
    this.hlo = lo;
    this.hhi = hi;
  }
  /** Only a legal en-passant capture changes the position's repetition identity. */
  private hashEpFile() {
    if (this.ep < 0) return -1;
    const side = this.ep >> 4 === 2 ? 1 : -1;
    const captured = this.ep + side * 16;
    if (this.b[captured] !== -side * P || this.b[this.ep]) return -1;
    for (const from of [captured - 1, captured + 1]) {
      if (from & 0x88 || this.b[from] !== side * P) continue;
      this.b[from] = 0;
      this.b[captured] = 0;
      this.b[this.ep] = side * P;
      const legal = !this.inCheck(side);
      this.b[from] = side * P;
      this.b[captured] = -side * P;
      this.b[this.ep] = 0;
      if (legal) return this.ep & 7;
    }
    return -1;
  }
  private zp(p: number, s: number) {
    this.hlo ^= Z_PIECE_LO[(p + 6) * 128 + s];
    this.hhi ^= Z_PIECE_HI[(p + 6) * 128 + s];
  }
  private zstate() {
    this.hlo ^= Z_CASTLE_LO[this.castle];
    this.hhi ^= Z_CASTLE_HI[this.castle];
    const epFile = this.hashEpFile();
    if (epFile >= 0) {
      this.hlo ^= Z_EP_LO[epFile];
      this.hhi ^= Z_EP_HI[epFile];
    }
  }
  /** Pass the move (null-move pruning). */
  makeNull() {
    this.keys.push(this.hlo, this.hhi);
    this.hist.push(0, 0, -1, this.castle, this.ep, this.half);
    this.zstate();
    this.ep = -1;
    this.zstate();
    this.side = -this.side;
    this.hlo ^= Z_SIDE_LO;
    this.hhi ^= Z_SIDE_HI;
    this.half++;
  }
  unmakeNull() {
    const h = this.hist;
    this.half = h.pop()!;
    this.ep = h.pop()!;
    this.castle = h.pop()!;
    h.length -= 3;
    this.side = -this.side;
    this.hhi = this.keys.pop()!;
    this.hlo = this.keys.pop()!;
  }
  /** Has the current position occurred before since the last irreversible move? */
  repeated() {
    const k = this.keys;
    const stop = Math.max(0, k.length - this.half * 2);
    for (let i = k.length - 4; i >= stop; i -= 4)
      if (k[i] === this.hlo && k[i + 1] === this.hhi) return true;
    return false;
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
    this.keys.push(this.hlo, this.hhi);
    this.zstate();
    if (flag === 1) {
      capSq = to + (me === 1 ? 16 : -16);
      captured = b[capSq];
      b[capSq] = 0;
    }
    this.hist.push(m, captured, capSq, this.castle, this.ep, this.half);
    if (captured) this.zp(captured, capSq);
    this.zp(piece, from);
    const placed = promo ? promo * me : piece;
    this.zp(placed, to);
    b[to] = placed;
    b[from] = 0;
    if (flag === 2) {
      const [rf, rt] = to > from ? [from + 3, from + 1] : [from - 4, from - 1];
      this.zp(b[rf], rf);
      this.zp(b[rf], rt);
      b[rt] = b[rf];
      b[rf] = 0;
    }
    if (piece * me === K) this.kings[me === 1 ? 0 : 1] = to;
    this.castle &= CASTLE_MASK[from] & CASTLE_MASK[to];
    this.ep = flag === 3 ? (from + to) >> 1 : -1;
    this.zstate();
    this.half = captured || piece * me === P ? 0 : this.half + 1;
    this.side = -me;
    this.hlo ^= Z_SIDE_LO;
    this.hhi ^= Z_SIDE_HI;
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
    this.hhi = this.keys.pop()!;
    this.hlo = this.keys.pop()!;
  }

  /** Non-pawn, non-king material of a side (for null-move safety and phase). */
  pieceMaterial(side: number) {
    let v = 0;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) {
        s += 7;
        continue;
      }
      const p = this.b[s] * side;
      if (p > P && p < K) v += VALUE[p];
    }
    return v;
  }

  /**
   * Tapered evaluation (middlegame ↔ endgame by remaining material): material, PST,
   * pawn structure (doubled / isolated / passed), mobility, bishop pair, rook on open
   * file, king pawn shield, and mop-up knowledge for lone-king endings (KQK, KRK…).
   * Returned from the side to move's point of view.
   */
  evaluate(): number {
    const b = this.b;
    let mg = 0;
    let eg = 0;
    let phase = 0;
    const pawnFiles = [new Int8Array(8), new Int8Array(8)]; // [white, black] counts per file
    const bishops = [0, 0];
    const nonPawn = [0, 0];
    const pawns = [0, 0];
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) {
        s += 7;
        continue;
      }
      const p = b[s];
      if (!p) continue;
      const t = p > 0 ? p : -p;
      const w = p > 0 ? 0 : 1;
      if (t === P) {
        pawnFiles[w][s & 7]++;
        pawns[w]++;
      } else if (t !== K) nonPawn[w] += VALUE[t];
      if (t === B) bishops[w]++;
      phase += PHASE[t];
    }
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) {
        s += 7;
        continue;
      }
      const p = b[s];
      if (!p) continue;
      const t = p > 0 ? p : -p;
      const sign = p > 0 ? 1 : -1;
      const sq = p > 0 ? s : mirror(s);
      const w = p > 0 ? 0 : 1;
      let m = MG_VALUE[t] + PST_W[t][sq];
      let e =
        EG_VALUE[t] +
        (t === K ? PST_W[7][sq] : t === P ? EG_PAWN[sq] : PST_W[t][sq]);
      if (t === P) {
        const f = s & 7;
        const rank = sq >> 4; // 0 = 8th rank from own view
        if (pawnFiles[w][f] > 1) {
          m -= 12;
          e -= 20;
        }
        if (
          (f === 0 || !pawnFiles[w][f - 1]) &&
          (f === 7 || !pawnFiles[w][f + 1])
        ) {
          m -= 10;
          e -= 15;
        }
        if (this.passed(s, sign)) {
          const adv = 7 - rank; // 1..6
          m += PASSED_MG[adv];
          e += PASSED_EG[adv];
        }
      } else if (t === N || t === B || t === R || t === Q) {
        const mob = this.mobility(s, t);
        m += MOB_MG[t] * (mob - MOB_BASE[t]);
        e += MOB_EG[t] * (mob - MOB_BASE[t]);
        if (t === R) {
          const f = s & 7;
          if (!pawnFiles[0][f] && !pawnFiles[1][f]) m += 20;
          else if (!pawnFiles[w][f]) m += 10;
        }
      } else if (t === K) {
        m += this.shield(s, sign);
      }
      mg += sign * m;
      eg += sign * e;
    }
    if (bishops[0] >= 2) {
      mg += 30;
      eg += 50;
    }
    if (bishops[1] >= 2) {
      mg -= 30;
      eg -= 50;
    }
    const ph = Math.min(phase, 24);
    let score = (mg * ph + eg * (24 - ph)) / 24;
    // Lone king: drive it to the edge/corner and bring our king close (KQK, KRK, KBBK…).
    for (const [strong, weak] of [
      [0, 1],
      [1, 0],
    ]) {
      if (pawns[weak] || nonPawn[weak] || nonPawn[strong] < VALUE[R]) continue;
      const lk = this.kings[weak];
      const sk = this.kings[strong];
      const lr = lk >> 4,
        lf = lk & 7;
      const edge = Math.max(3 - lr, lr - 4) + Math.max(3 - lf, lf - 4);
      const dist =
        Math.abs((lk >> 4) - (sk >> 4)) + Math.abs((lk & 7) - (sk & 7));
      const bonus = 600 + 40 * edge + 25 * (14 - dist);
      score += strong === 0 ? bonus : -bonus;
    }
    // Insufficient material → draw-ish.
    if (
      !pawns[0] &&
      !pawns[1] &&
      nonPawn[0] <= VALUE[B] &&
      nonPawn[1] <= VALUE[B]
    )
      score = 0;
    return Math.round(score) * this.side;
  }
  private passed(s: number, sign: number) {
    const f = s & 7;
    const dir = sign === 1 ? -16 : 16;
    for (let t = s + dir; !(t & 0x88); t += dir)
      for (const df of [-1, 0, 1]) {
        const q = t + df;
        if (df && ((q & 7) !== f + df || q & 0x88)) continue;
        if (this.b[q] === -sign * P) return false;
      }
    return true;
  }
  private mobility(s: number, t: number) {
    const b = this.b;
    let n = 0;
    if (t === N) {
      for (const d of KNIGHT) {
        const q = s + d;
        if (!(q & 0x88) && b[q] * b[s] <= 0) n++;
      }
      return n;
    }
    const dirs = t === B ? BISHOP : t === R ? ROOK : KING;
    for (const d of dirs)
      for (let q = s + d; !(q & 0x88); q += d) {
        if (b[q] * b[s] > 0) break;
        n++;
        if (b[q]) break;
      }
    return n;
  }
  private shield(k: number, sign: number) {
    // Pawns directly in front of a castled-ish king.
    const f = k & 7;
    if (f >= 3 && f <= 4) return -15;
    const fwd = sign === 1 ? -16 : 16;
    let v = 0;
    for (const df of [-1, 0, 1]) {
      const q = k + fwd + df;
      if (q & 0x88) continue;
      if (this.b[q] === sign * P) v += 12;
      else if (!((q + fwd) & 0x88) && this.b[q + fwd] === sign * P) v += 6;
      else v -= 10;
    }
    return v;
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
