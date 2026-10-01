import { createGame, startGame, currentPlayer, isBlocked, log as pushLog } from './game/state.js';
import { CARD_LEVELS } from './game/cards.js';
import { RANSOM_COST } from './game/config.js';
import * as A from './game/actions.js';

/**
 * Комната = партия. Состояние живёт в памяти процесса; вся игра сериализуема,
 * так что переезд в Redis/Postgres не потребует правок движка.
 */
const rooms = new Map();
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = (n = 6) =>
  Array.from({ length: n }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

export function createRoom({ hostName, maxPlayers = 4 }) {
  let id;
  do { id = code(); } while (rooms.has(id));
  const room = {
    id,
    createdAt: Date.now(),
    hostId: null,
    sockets: new Map(),
    game: null,
    maxPlayers,
  };
  rooms.set(id, room);
  if (hostName) {
    const p = addPlayer(room, hostName);
    room.hostId = p.id;
  }
  return room;
}

export const getRoom = (id) => rooms.get(String(id || '').toUpperCase());

export function addPlayer(room, name) {
  const g = ensureGame(room);
  if (g.status !== 'lobby') throw new Error('Партия уже началась');
  if (g.players.length >= room.maxPlayers) throw new Error('Комната заполнена');

  const clean = String(name || '').trim().slice(0, 16);
  if (!clean) throw new Error('Введите никнейм');
  if (g.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
    throw new Error('Такой ник уже занят в этой комнате');
  }

  const id = `p_${code(8)}`;
  const seat = g.players.length;
  g.players.push({
    id, name: clean,
    color: ['red', 'blue', 'green', 'yellow'][seat],
    seat,
    coins: 3, points: 0, cards: [], markersLeft: 10,
    core: { q: 0, r: 0 }, skipTurns: 0, skipActions: 0, isBot: false,
  });
  return { id, name: clean };
}

/** Ленивая инициализация партии при подключении хоста. */
export function ensureGame(room) {
  if (!room.game) {
    room.game = createGame({ seed: Date.now() >>> 0, playerDefs: [] });
  }
  return room.game;
}

export const attachSocket = (room, playerId, ws) => room.sockets.set(playerId, ws);
export const detachSocket = (room, playerId) => room.sockets.delete(playerId);

/* ------------------------- ПРОЕКЦИЯ СОСТОЯНИЯ ------------------------- */

/**
 * Персональная проекция. Правила приватности:
 *  - закрытые тайлы уходят как 'unknown' — иначе ловушки видны в DevTools;
 *  - состав Резерва Сети не уходит вообще, только количество;
 *  - подсказки Сниффера видит только тот, кто их добыл;
 *  - блокировки Ransomware и карты соперников — только по факту, без лишнего.
 */
export function viewFor(room, playerId) {
  const g = room.game;
  if (!g) return { roomId: room.id, status: 'lobby', players: [], you: playerId };

  const myPeek = g.peek?.[playerId] ?? {};

  return {
    roomId: room.id,
    status: g.status,
    you: playerId,
    hostId: room.hostId,
    round: g.round,
    phase: g.phase,
    actionsLeft: g.currentIndex === g.players.findIndex((p) => p.id === playerId) ? g.actionsLeft : null,
    currentPlayerId: currentPlayer(g)?.id ?? null,
    routerPlaced: g.routerPlaced,
    finalRoundsLeft: g.finalRoundsLeft,
    reserveCount: g.reserve.length,
    market: g.market,
    ransomCost: RANSOM_COST,

    players: g.players.map((p) => {
      const isMe = p.id === playerId;
      return {
        id: p.id,
        name: p.name,
        color: p.color,
        coins: p.coins,
        points: p.points,                 // очки открыты — это публичный счёт завоеваний
        markersLeft: p.markersLeft,
        core: p.core,
        skipTurns: p.skipTurns,
        // Карты соперников скрыты до момента, когда они «включились».
        cards: isMe
          ? p.cards
          : p.cards.filter((c) => c.armed).map((c) => ({ ...c, id: c.id, armed: true, used: c.used })),
        cardCount: p.cards.length,
      };
    }),

    tiles: Object.values(g.tiles).map((t) => ({
      q: t.q, r: t.r,
      type: t.faceUp ? t.type : 'unknown',
      faceUp: t.faceUp,
      markers: t.markers,
      blockedFor: (t.blockedFor ?? []).map((b) => ({
        playerId: b.playerId,
        by: b.by,
        mine: b.playerId === playerId,
        canPay: b.playerId === playerId,
      })),
      hasMyMarker: t.markers.some((m) => m.playerId === playerId),
      peek: myPeek[`${t.q},${t.r}`] ?? null,   // приватная подсказка Сниффера
    })),

    pending: g.pending
      ? (g.pending.playerId === playerId
          ? { type: g.pending.type, options: g.pending.options ?? null }
          : { type: g.pending.type, waitingFor: g.pending.playerId, waitingForName: g.players.find((p) => p.id === g.pending.playerId)?.name })
      : null,

    log: g.log.slice(-60),
    winnerId: g.winnerId,
    finalScores: g.finalScores ?? null,
  };
}

export function broadcast(room) {
  for (const [pid, ws] of room.sockets) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'state', state: viewFor(room, pid) }));
    }
  }
}

/* --------------------------- ДИСПЕТЧЕР --------------------------- */

export function dispatch(room, playerId, action) {
  const g = room.game;
  if (!g) return { error: 'Партия не создана' };
  const { type, payload = {} } = action;

  switch (type) {
    case 'start': {
      if (room.hostId !== playerId) return { error: 'Начать партию может только хост' };
      const r = startGame(g);
      if (r.error) return r;
      broadcast(room);
      return { ok: true };
    }
    case 'move': return fin(room, A.move(g, playerId, payload.target));
    case 'hack': return fin(room, A.hack(g, playerId, payload.mode, { zeroDay: payload.zeroDay }));
    case 'attack': return fin(room, A.attack(g, playerId, payload.targetPlayerId));
    case 'buy': return fin(room, A.buy(g, playerId, payload.cardId));
    case 'ability': return fin(room, A.useAbility(g, playerId, payload.cardId, payload));
    case 'payRansom': return fin(room, A.payRansom(g, playerId, payload.tileKey));
    case 'placeTile': return fin(room, A.placeTile(g, playerId, payload.slot, payload.reserveIndex ?? 0));
    case 'placeRouter': return fin(room, A.placeRouter(g, playerId, payload.slot));
    case 'chooseDrop': return fin(room, A.chooseDrop(g, playerId, payload.uid));
    case 'pass': return fin(room, A.pass(g, playerId));
    case 'endTurn': return fin(room, A.endTurn(g));
    default: return { error: 'Неизвестное действие' };
  }
}

function fin(room, result) {
  if (result?.error) return result;
  broadcast(room);
  return result ?? { ok: true };
}

export const ROOMS = rooms;
