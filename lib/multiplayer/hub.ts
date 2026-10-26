// RoomHub: rooms, seats, seat tokens, reconnection, timers and rate limits.
// No I/O of its own: a transport hands it connections and it calls `send`.
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  isRoomCode,
  parseClientMsg,
  type ErrorCode,
  type GameModule,
  type Seat,
  type ServerMsg,
} from './protocol.ts';

export type Conn = { send(msg: ServerMsg): void; close?(): void; ip: string };

type Room = {
  code: string;
  game: GameModule;
  state: unknown;
  version: number;
  seats: { token: string; name: string; conns: Set<Conn> }[];
  spectators: Set<Conn>;
  creatorIp: string;
  touched: number;
  timer: ReturnType<typeof setTimeout> | null;
};

export type HubOptions = {
  now?: () => number;
  random?: () => number;
  /** Idle rooms (nobody connected) are dropped after this long. */
  idleMs?: number;
  maxRooms?: number;
  roomsPerIp?: number;
  /** Messages per connection per second. */
  rate?: number;
};

const randomToken = (rnd: () => number) =>
  Array.from({ length: 24 }, () => Math.floor(rnd() * 36).toString(36)).join(
    '',
  );

export class RoomHub {
  private games = new Map<string, GameModule>();
  private rooms = new Map<string, Room>();
  private where = new Map<Conn, { room: Room; seat: Seat | null }>();
  private budget = new Map<Conn, { at: number; n: number }>();
  private now: () => number;
  private rnd: () => number;
  private o: Required<Omit<HubOptions, 'now' | 'random'>>;

  // Modules are invariant in their state type; the hub treats state as opaque.
  // oxlint-disable-next-line typescript/no-explicit-any
  constructor(games: GameModule<any, any>[], opts: HubOptions = {}) {
    for (const g of games) this.games.set(g.id, g as GameModule);
    this.now = opts.now ?? Date.now;
    this.rnd = opts.random ?? Math.random;
    this.o = {
      idleMs: opts.idleMs ?? 30 * 60_000,
      maxRooms: opts.maxRooms ?? 500,
      roomsPerIp: opts.roomsPerIp ?? 8,
      rate: opts.rate ?? 20,
    };
  }

  get roomCount() {
    return this.rooms.size;
  }

  message(conn: Conn, raw: string) {
    const t = this.now();
    const b = this.budget.get(conn) ?? { at: t, n: 0 };
    if (t - b.at >= 1000) {
      b.at = t;
      b.n = 0;
    }
    b.n++;
    this.budget.set(conn, b);
    if (b.n > this.o.rate)
      return this.fail(conn, 'rate-limited', '操作太频繁，请稍等');
    const m = parseClientMsg(raw);
    if (!m) return this.fail(conn, 'bad-message', '无法识别的消息');
    if (m.t === 'ping') return conn.send({ t: 'pong' });
    if (m.t === 'create') return this.create(conn, m.game, m.options, m.name);
    if (m.t === 'join') return this.join(conn, m.code, m.token, m.name);
    return this.act(conn, m.action);
  }

  disconnect(conn: Conn) {
    this.budget.delete(conn);
    const at = this.where.get(conn);
    this.where.delete(conn);
    if (!at) return;
    const { room, seat } = at;
    if (seat === null) room.spectators.delete(conn);
    else room.seats[seat].conns.delete(conn);
    room.touched = this.now();
    this.presence(room);
    this.broadcast(room);
  }

  /** Drop rooms nobody has touched for `idleMs`. Call periodically. */
  sweep() {
    const t = this.now();
    for (const room of this.rooms.values()) {
      const live =
        room.spectators.size > 0 || room.seats.some((s) => s.conns.size > 0);
      if (!live && t - room.touched > this.o.idleMs) this.drop(room);
    }
  }

  close() {
    for (const room of this.rooms.values()) this.drop(room);
  }

  private drop(room: Room) {
    if (room.timer) clearTimeout(room.timer);
    this.rooms.delete(room.code);
  }

  private fail(conn: Conn, code: ErrorCode, message: string) {
    conn.send({ t: 'error', code, message });
  }

  private create(conn: Conn, gameId: string, raw: unknown, name?: string) {
    const game = this.games.get(gameId);
    if (!game) return this.fail(conn, 'no-game', '没有这个游戏');
    if (this.rooms.size >= this.o.maxRooms)
      return this.fail(conn, 'too-many-rooms', '服务器房间已满，请稍后再试');
    let mine = 0;
    for (const r of this.rooms.values()) if (r.creatorIp === conn.ip) mine++;
    if (mine >= this.o.roomsPerIp)
      return this.fail(conn, 'too-many-rooms', '你开的房间太多了');
    let options: unknown;
    try {
      options = game.options(raw);
    } catch (e) {
      return this.fail(conn, 'illegal', (e as Error).message || '选项无效');
    }
    let code = '';
    do {
      code = Array.from(
        { length: ROOM_CODE_LENGTH },
        () =>
          ROOM_CODE_ALPHABET[
            Math.floor(this.rnd() * ROOM_CODE_ALPHABET.length)
          ],
      ).join('');
    } while (this.rooms.has(code));
    const room: Room = {
      code,
      game,
      state: game.create(options, this.rnd, this.now()),
      version: 0,
      seats: Array.from({ length: game.seats }, () => ({
        token: '',
        name: '',
        conns: new Set<Conn>(),
      })),
      spectators: new Set(),
      creatorIp: conn.ip,
      touched: this.now(),
      timer: null,
    };
    this.rooms.set(code, room);
    this.join(conn, code, undefined, name);
  }

  private join(conn: Conn, code: string, token?: string, name?: string) {
    const room = isRoomCode(code) ? this.rooms.get(code) : undefined;
    if (!room) return this.fail(conn, 'no-room', '房间不存在或已过期');
    this.leaveCurrent(conn);
    let seat = token ? room.seats.findIndex((s) => s.token === token) : -1;
    if (seat < 0) {
      seat = room.seats.findIndex((s) => !s.token);
      if (seat < 0) return this.fail(conn, 'room-full', '房间已满');
      room.seats[seat].token = randomToken(this.rnd);
    }
    const s = room.seats[seat];
    if (name) s.name = name;
    else if (!s.name) s.name = `玩家 ${seat + 1}`;
    s.conns.add(conn);
    this.where.set(conn, { room, seat });
    room.touched = this.now();
    conn.send({ t: 'joined', code, seat, token: s.token, game: room.game.id });
    this.presence(room);
    this.broadcast(room);
  }

  private leaveCurrent(conn: Conn) {
    if (this.where.has(conn)) this.disconnect(conn);
  }

  private act(conn: Conn, action: unknown) {
    const at = this.where.get(conn);
    if (!at || at.seat === null)
      return this.fail(conn, 'not-seated', '你还没有入座');
    const { room, seat } = at;
    const r = room.game.act(room.state, seat, action, this.rnd, this.now());
    if (r.error !== undefined) return this.fail(conn, 'illegal', r.error);
    room.state = r.state;
    room.touched = this.now();
    this.broadcast(room);
  }

  private presence(room: Room) {
    if (!room.game.presence) return;
    room.state = room.game.presence(
      room.state,
      room.seats.map((s) => s.conns.size > 0),
      this.now(),
    );
  }

  private broadcast(room: Room) {
    room.version++;
    const seats = room.seats.map((s) => ({
      name: s.name,
      online: s.conns.size > 0,
      taken: !!s.token,
    }));
    const t = this.now();
    room.seats.forEach((s, i) => {
      if (!s.conns.size) return;
      const view = room.game.view(room.state, i, t);
      for (const c of s.conns)
        c.send({ t: 'state', version: room.version, seats, view });
    });
    if (room.spectators.size) {
      const view = room.game.view(room.state, null, t);
      for (const c of room.spectators)
        c.send({ t: 'state', version: room.version, seats, view });
    }
    this.schedule(room);
  }

  private schedule(room: Room) {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    const at = room.game.nextTick?.(room.state);
    if (at == null || !room.game.tick) return;
    room.timer = setTimeout(
      () => {
        room.timer = null;
        if (!this.rooms.has(room.code)) return;
        room.state = room.game.tick!(room.state, this.rnd, this.now());
        this.broadcast(room);
      },
      Math.max(0, at - this.now()),
    );
  }
}
