// A trivial two-seat game used by tests and as a smoke check in production:
// seats take turns adding a number; first to reach the target wins.
import type { GameModule } from './protocol.ts';

type S = { total: number; target: number; turn: number; winner: number | null };

export const echoModule: GameModule<S, { target: number }> = {
  id: 'echo',
  seats: 2,
  options(raw) {
    const t = (raw as { target?: unknown } | undefined)?.target ?? 10;
    if (typeof t !== 'number' || !Number.isInteger(t) || t < 1 || t > 100)
      throw new Error('target 需为 1–100 的整数');
    return { target: t };
  },
  create: (o) => ({ total: 0, target: o.target, turn: 0, winner: null }),
  act(s, seat, action) {
    if (s.winner !== null) return { error: '已经结束' };
    if (seat !== s.turn) return { error: '还没轮到你' };
    const n = (action as { add?: unknown } | null)?.add;
    if (n !== 1 && n !== 2) return { error: '只能加 1 或 2' };
    const total = s.total + n;
    return {
      state: {
        ...s,
        total,
        turn: 1 - seat,
        winner: total >= s.target ? seat : null,
      },
    };
  },
  view: (s, seat) => ({ ...s, you: seat }),
};
