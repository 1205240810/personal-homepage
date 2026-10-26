// Browser/Node client for the play relay: connects, creates or joins a room,
// keeps the seat token and transparently reconnects after drops.
import type { ClientMsg, SeatInfo, ServerMsg } from './protocol.ts';

export type PlayStatus =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'closed';

export type PlaySnapshot<V = unknown> = {
  status: PlayStatus;
  code: string | null;
  seat: number | null;
  seats: SeatInfo[];
  view: V | null;
  version: number;
  error: string | null;
};

type TokenStore = {
  get(code: string): string | null;
  set(code: string, token: string): void;
};

export const browserTokens: TokenStore = {
  get: (code) => {
    try {
      return localStorage.getItem(`tscjj-play:${code}`);
    } catch {
      return null;
    }
  },
  set: (code, token) => {
    try {
      localStorage.setItem(`tscjj-play:${code}`, token);
    } catch {
      /* private mode: reconnection only lasts this tab */
    }
  },
};

export function defaultPlayUrl() {
  const { protocol, host, hostname } = globalThis.location;
  // `npm run dev` can't proxy WebSockets through the Worker dev server, so in
  // development talk to `npm run play:server` directly.
  if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV)
    return `ws://${hostname}:3100/play/ws`;
  return `${protocol === 'https:' ? 'wss' : 'ws'}://${host}/play/ws`;
}

export type PlayClientOptions = {
  url?: string;
  tokens?: TokenStore;
  WebSocketImpl?: typeof WebSocket;
  name?: string;
  game?: string;
};

export class PlayClient<V = unknown> {
  snapshot: PlaySnapshot<V> = {
    status: 'idle',
    code: null,
    seat: null,
    seats: [],
    view: null,
    version: 0,
    error: null,
  };
  private ws: WebSocket | null = null;
  private listeners = new Set<() => void>();
  private intent: ClientMsg | null = null;
  private token: string | null = null;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private memoryTokens = new Map<string, string>();
  private o: PlayClientOptions;

  constructor(o: PlayClientOptions = {}) {
    this.o = o;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snapshot;

  create(game: string, options?: unknown) {
    this.start({ t: 'create', game, options, name: this.o.name });
  }
  join(code: string) {
    const c = code.trim().toUpperCase();
    this.token = this.tokens().get(c) ?? this.memoryTokens.get(c) ?? null;
    this.start({
      t: 'join',
      code: c,
      token: this.token ?? undefined,
      name: this.o.name,
      game: this.o.game,
    });
  }
  act(action: unknown) {
    this.send({ t: 'act', action });
  }
  close() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.set({ status: 'closed' });
  }

  private tokens(): TokenStore {
    return (
      this.o.tokens ?? {
        get: (c) => this.memoryTokens.get(c) ?? null,
        set: (c, t) => void this.memoryTokens.set(c, t),
      }
    );
  }

  private start(intent: ClientMsg) {
    this.intent = intent;
    this.stopped = false;
    this.set({ error: null, code: null, seat: null, seats: [], view: null, version: 0 });
    this.connect();
  }

  private connect() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.ws?.close();
    const WS = this.o.WebSocketImpl ?? globalThis.WebSocket;
    this.set({ status: this.snapshot.code ? 'reconnecting' : 'connecting' });
    const ws = new WS(this.o.url ?? defaultPlayUrl());
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws || this.stopped) return;
      this.retry = 0;
      if (this.intent) ws.send(JSON.stringify(this.intent));
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws || this.stopped) return;
      this.receive(JSON.parse(String(ev.data)) as ServerMsg);
    };
    ws.onclose = () => {
      if (this.ws !== ws || this.stopped) return;
      this.set({ status: 'reconnecting' });
      const delay = Math.min(8000, 500 * 2 ** this.retry++);
      this.timer = setTimeout(() => this.connect(), delay);
    };
  }

  private receive(m: ServerMsg) {
    if (m.t === 'joined') {
      this.token = m.token;
      this.tokens().set(m.code, m.token);
      this.memoryTokens.set(m.code, m.token);
      // Future reconnects rejoin the same seat.
      this.intent = {
        t: 'join',
        code: m.code,
        token: m.token,
        name: this.o.name,
        game: this.o.game,
      };
      this.set({ status: 'open', code: m.code, seat: m.seat });
      const queued = this.pending.splice(0);
      for (const q of queued) this.send(q);
    } else if (m.t === 'state') {
      if (m.version < this.snapshot.version && this.snapshot.status === 'open')
        return;
      this.set({ seats: m.seats, view: m.view as V, version: m.version });
    } else if (m.t === 'error') {
      if (m.code === 'no-room' || m.code === 'room-full' || m.code === 'wrong-game') {
        this.close();
        this.set({ code: null, seat: null, seats: [], view: null, version: 0 });
      }
      this.set({
        error: m.message,
        status: this.stopped ? 'closed' : this.snapshot.status,
      });
    }
  }

  private pending: ClientMsg[] = [];
  private send(m: ClientMsg) {
    // While reconnecting, hold actions and replay them once seated again.
    if (this.ws && this.ws.readyState === 1 && this.snapshot.status === 'open')
      this.ws.send(JSON.stringify(m));
    else if (this.pending.length < 8) this.pending.push(m);
  }

  private set(p: Partial<PlaySnapshot<V>>) {
    this.snapshot = { ...this.snapshot, ...p };
    for (const fn of this.listeners) fn();
  }
}
