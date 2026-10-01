import WebSocket from 'ws';

const API = 'http://localhost:8080';
const post = (path, body) =>
  fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    .then((r) => r.json());

function client(roomId, playerId, label) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:8080/ws?room=${roomId}&player=${playerId}`);
    const c = { label, ws, state: null, errors: [] };
    ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.type === 'state') c.state = m.state;
      if (m.type === 'error') c.errors.push(m.error);
    });
    ws.on('open', () => resolve(c));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Один ход: либо шагаем на закрытый тайл, либо взламываем, затем расширяем сеть.
function playTurn(c) {
  const st = c.state;
  if (!st || st.pending?.waitingFor) return;
  const me = st.players.find((p) => p.id === st.you);
  if (st.currentPlayerId !== st.you) return;

  if (st.pending?.type === 'place_tile' && st.pending.options?.length) {
    c.ws.send(JSON.stringify({ type: 'placeTile', payload: { slot: st.pending.options[0] } }));
    return;
  }
  const here = st.tiles.find((t) => t.q === me.core.q && t.r === me.core.r);
  if (here && here.faceUp && ['basic', 'medium', 'hard'].includes(here.type) &&
      !here.markers.some((m) => m.playerId === st.you)) {
    c.ws.send(JSON.stringify({ type: 'hack', payload: { mode: 'classic' } }));
    return;
  }
  // Шагаем только на соседний закрытый тайл.
  const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const byKey = new Map(st.tiles.map((t) => [`${t.q},${t.r}`, t]));
  for (const [dq, dr] of dirs) {
    const k = `${me.core.q + dq},${me.core.r + dr}`;
    const t = byKey.get(k);
    if (t && !t.faceUp) {
      c.ws.send(JSON.stringify({ type: 'move', payload: { target: { q: t.q, r: t.r } } }));
      return;
    }
  }
  c.ws.send(JSON.stringify({ type: 'pass' }));
}

const room = await post('/api/rooms', { name: 'Аня' });
const bob = await post(`/api/rooms/${room.roomId}/join`, { name: 'Боб' });
console.log('комната:', room.roomId, '| игроки: Аня, Боб');

const a = await client(room.roomId, room.playerId, 'Аня');
const b = await client(room.roomId, bob.playerId, 'Боб');
await sleep(150);
a.ws.send(JSON.stringify({ type: 'start' }));
await sleep(200);
console.log('статус:', a.state.status, '| ход:', a.state.currentPlayerId === a.state.you ? 'Аня' : 'Боб');

for (let i = 0; i < 40; i++) {
  playTurn(a); playTurn(b);
  await sleep(35);
  if (a.state?.status === 'finished') break;
}

const s = a.state;
console.log('\n--- итог ---');
console.log('круг:', s.round, '| фаза:', s.phase, '| тайлов на поле:', s.tiles.length, '| резерв:', s.reserveCount);
console.log('открытых тайлов:', s.tiles.filter((t) => t.faceUp).length);
for (const p of s.players) {
  const held = s.tiles.filter((t) => t.markers?.some((m) => m.playerId === p.id)).length;
  console.log(`  ${p.name}: ${p.points} очк, ${p.coins} C, узлов ${held}, карт ${p.cards.length}`);
}
console.log('ошибки Ани:', a.errors.slice(0, 3));
console.log('ошибки Боба:', b.errors.slice(0, 3));
console.log('утечка скрытых типов:', s.tiles.filter((t) => !t.faceUp && t.type !== 'unknown').length);
process.exit(0);
