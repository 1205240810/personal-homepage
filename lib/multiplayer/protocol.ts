// Shared wire protocol for 联机对战. Transport-agnostic: the Node relay
// (server/play) speaks it today; a Cloudflare Durable Object can host the same
// RoomHub later. Pure TypeScript, no Node or DOM APIs.

/** Seat index at the table (0-based); null for spectators. */
export type Seat = number;

export type SeatInfo = { name: string; online: boolean; taken: boolean };

export type ClientMsg =
  | { t: 'create'; game: string; options?: unknown; name?: string }
  | { t: 'join'; code: string; token?: string; name?: string; game?: string }
  | { t: 'act'; action: unknown }
  | { t: 'ping' };

export type ServerMsg =
  | { t: 'joined'; code: string; seat: Seat; token: string; game: string }
  | {
      t: 'state';
      version: number;
      seats: SeatInfo[];
      view: unknown;
    }
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'pong' };

export type ErrorCode =
  | 'bad-message'
  | 'no-game'
  | 'no-room'
  | 'room-full'
  | 'wrong-game'
  | 'not-seated'
  | 'illegal'
  | 'rate-limited'
  | 'too-many-rooms';

/** Result of applying one action; `error` leaves the state untouched. */
export type ActResult<S> = { state: S; error?: undefined } | { error: string };

/**
 * One online game. The hub owns rooms, seats and transport; the module owns
 * rules. Everything a seat may see goes through `view`, so hidden information
 * (decks, hole cards) never leaves the server.
 */
export type GameModule<S = unknown, O = unknown> = {
  id: string;
  seats: number;
  /** Validate and normalise client-supplied options; throw on nonsense. */
  options(raw: unknown): O;
  create(options: O, rng: () => number, now: number): S;
  act(
    state: S,
    seat: Seat,
    action: unknown,
    rng: () => number,
    now: number,
  ): ActResult<S>;
  /** What one seat sees (null = spectator). Must be JSON-serialisable. */
  view(state: S, seat: Seat | null, now: number): unknown;
  /** Seat joined / reconnected or dropped; lets games pause timers. */
  presence?(state: S, online: boolean[], now: number): S;
  /** Timestamp at which `tick` must run (AI turns, timeouts), or null. */
  nextTick?(state: S): number | null;
  tick?(state: S, rng: () => number, now: number): S;
};

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const isRoomCode = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length === ROOM_CODE_LENGTH &&
  /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]+$/.test(v);

export function parseClientMsg(raw: string): ClientMsg | null {
  if (raw.length > 4096) return null;
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  const name =
    typeof o.name === 'string' ? o.name.trim().slice(0, 16) : undefined;
  switch (o.t) {
    case 'create':
      return typeof o.game === 'string'
        ? { t: 'create', game: o.game, options: o.options, name }
        : null;
    case 'join':
      return typeof o.code === 'string'
        ? {
            t: 'join',
            code: o.code.toUpperCase(),
            token: typeof o.token === 'string' ? o.token : undefined,
            name,
            game: typeof o.game === 'string' ? o.game : undefined,
          }
        : null;
    case 'act':
      return { t: 'act', action: o.action };
    case 'ping':
      return { t: 'ping' };
    default:
      return null;
  }
}
