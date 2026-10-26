// 联机对战 relay: a tiny WebSocket server on 127.0.0.1:3100 behind Nginx's
// /play/ws. Run with `npm run play:server` (see docs/SELF-HOSTING.md).
import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { RoomHub, type Conn } from '../../lib/multiplayer/hub.ts';
import { GAME_MODULES } from '../../lib/multiplayer/games.ts';

export function startPlayServer({
  port = Number(process.env.PLAY_PORT ?? 3100),
  host = process.env.PLAY_HOST ?? '127.0.0.1',
  hub = new RoomHub(GAME_MODULES),
} = {}) {
  const http = createServer((req, res) => {
    if (req.url === '/play/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: hub.roomCount }));
      return;
    }
    res.writeHead(404).end();
  });
  const wss = new WebSocketServer({
    server: http,
    path: '/play/ws',
    maxPayload: 8 * 1024,
  });
  const alive = new WeakMap<WebSocket, boolean>();
  wss.on('connection', (ws, req) => {
    const fwd = req.headers['x-real-ip'];
    const ip =
      (typeof fwd === 'string' && fwd) || req.socket.remoteAddress || '?';
    const conn: Conn = {
      ip,
      send: (m) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
      },
      close: () => ws.close(),
    };
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      hub.message(conn, Buffer.from(data as Buffer).toString('utf8'));
    });
    ws.on('close', () => hub.disconnect(conn));
    ws.on('error', () => ws.terminate());
  });
  // Drop half-open sockets and idle rooms.
  const beat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.get(ws)) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
    hub.sweep();
  }, 20_000);
  beat.unref();
  return new Promise<{ port: number; close(): Promise<void> }>((resolve) => {
    http.listen(port, host, () => {
      const addr = http.address();
      resolve({
        port: typeof addr === 'object' && addr ? addr.port : port,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(beat);
            hub.close();
            for (const ws of wss.clients) ws.terminate();
            wss.close();
            http.close(() => done());
          }),
      });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = await startPlayServer();
  console.log(`play server on 127.0.0.1:${s.port}/play/ws`);
  const stop = () => void s.close().then(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
