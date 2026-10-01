import http from 'node:http';
import { WebSocketServer } from 'ws';
import {
  createRoom, getRoom, addPlayer, attachSocket, detachSocket,
  broadcast, viewFor, dispatch, ROOMS, ensureGame,
} from './rooms.js';

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...CORS });
  res.end(JSON.stringify(body));
};

const readBody = (req) => new Promise((resolve) => {
  let data = '';
  req.on('data', (c) => { data += c; });
  req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
});

/** Простой rate-limit по IP — настолка с друзьями, но пусть будет. */
const hits = new Map();
function rateLimited(req) {
  const ip = req.socket.remoteAddress ?? '?';
  const now = Date.now();
  const rec = hits.get(ip) ?? { n: 0, t: now };
  if (now - rec.t > 60000) { rec.n = 0; rec.t = now; }
  rec.n += 1;
  hits.set(ip, rec);
  return rec.n > 240;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (rateLimited(req)) return json(res, 429, { error: 'Слишком много запросов, подождите' });

  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/health') {
    return json(res, 200, { ok: true, rooms: ROOMS.size, uptime: Math.round(process.uptime()) });
  }

  // Создать комнату: { name }
  if (req.method === 'POST' && url.pathname === '/api/rooms') {
    const body = await readBody(req);
    try {
      const room = createRoom({ hostName: body.name });
      const host = room.game.players[0];
      return json(res, 200, { roomId: room.id, playerId: host.id, name: host.name });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  // Присоединиться: { name }
  const joinMatch = url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/join$/);
  if (req.method === 'POST' && joinMatch) {
    const room = getRoom(joinMatch[1]);
    if (!room) return json(res, 404, { error: 'Комната не найдена' });
    const body = await readBody(req);
    try {
      const p = addPlayer(room, body.name);
      broadcast(room);
      return json(res, 200, { roomId: room.id, playerId: p.id, name: p.name });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  // Информация о комнате
  const infoMatch = url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)$/);
  if (req.method === 'GET' && infoMatch) {
    const room = getRoom(infoMatch[1]);
    if (!room) return json(res, 404, { error: 'Комната не найдена' });
    return json(res, 200, {
      roomId: room.id,
      status: room.game?.status ?? 'lobby',
      players: room.game?.players.map((p) => p.name) ?? [],
      maxPlayers: room.maxPlayers,
    });
  }

  return json(res, 404, { error: 'not found' });
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const room = getRoom(url.searchParams.get('room'));
  const playerId = url.searchParams.get('player');

  if (!room) { ws.send(JSON.stringify({ type: 'error', error: 'Комната не найдена' })); return ws.close(); }
  const g = ensureGame(room);
  if (!g.players.some((p) => p.id === playerId)) {
    ws.send(JSON.stringify({ type: 'error', error: 'Игрок не найден в этой комнате' }));
    return ws.close();
  }

  attachSocket(room, playerId, ws);
  ws.send(JSON.stringify({ type: 'state', state: viewFor(room, playerId) }));
  broadcast(room);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === 'ping') return ws.send(JSON.stringify({ type: 'pong' }));

    const result = dispatch(room, playerId, msg);
    if (result?.error) ws.send(JSON.stringify({ type: 'error', error: result.error }));
    else broadcast(room);
  });

  ws.on('close', () => { detachSocket(room, playerId); broadcast(room); });
  ws.on('error', () => {});
});

// Подстраховка: если кадр потерялся, добиваем состояние раз в 10 секунд.
setInterval(() => {
  for (const room of ROOMS.values()) if (room.sockets.size) broadcast(room);
}, 10000);

// Чистка заброшенных комнат (2 часа).
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of ROOMS) {
    if (now - room.createdAt > 7200_000 && room.sockets.size === 0) ROOMS.delete(id);
  }
}, 600_000);

server.listen(PORT, HOST, () => {
  console.log(`\n  MALHEM server`);
  console.log(`  HTTP   http://localhost:${PORT}`);
  console.log(`  WS     ws://localhost:${PORT}/ws?room=КОД&player=ID\n`);
});
