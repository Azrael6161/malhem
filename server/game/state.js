import { buildReserve, TILE_INFO, isNode } from './tiles.js';
import { CARDS, byId } from './cards.js';
import { shuffle, makeRng } from './rng.js';
import { keyOf, ring } from './hex.js';
import {
  COLORS, START_COINS, MARKERS_PER_PLAYER, POINTS_TO_TRIGGER, FINAL_ROUNDS, TILE_INFO,
  PHASE_LENGTHS, HARD_ROUND_CAP, INCOME_BY_TILE, SCORING_MODE,
  CRYPTO_LOCKER_BONUS, RANSOM_COST, INCOME_AFTER_ROUTER, START_COINS as _SC,
} from './config.js';

/**
 * Фаза по номеру круга.
 *  Фаза 1 — круги 1..PHASE_LENGTHS[1]
 *  Фаза 2 — круги PHASE_LENGTHS[1]+1 .. PHASE_LENGTHS[1]+PHASE_LENGTHS[2]
 *  Фаза 3 — все последующие круги
 */
export const phaseForRound = (round) => {
  if (round <= PHASE_LENGTHS[1]) return 1;
  if (round <= PHASE_LENGTHS[1] + PHASE_LENGTHS[2]) return 2;
  return 3;
};

/** Создание партии. */
export function markerLimit(playerCount, nodeHexCount) {
  if (playerCount >= 4) return MARKERS_PER_PLAYER;
  return Math.floor(nodeHexCount / Math.max(1, playerCount)) + 1;
}

export function createGame({ seed, playerDefs }) {
  const rng = makeRng(seed);
  const players = playerDefs.map((p, i) => ({
    id: p.id,
    name: p.name,
    color: COLORS[i] ?? COLORS[0],
    seat: i,
    coins: START_COINS,   // Ко́ины — валюта, тратится на рынке
    points: 0,            // Очки — сумма всех захватов, НИКОГДА не тратятся
    cards: [],
    markersLeft: MARKERS_PER_PLAYER,
    core: { q: 0, r: 0 },
    skipTurns: 0,
    skipActions: 0,
    isBot: false,
  }));

  const reserve = buildReserve(rng);
  const tiles = {};

  tiles[keyOf(0, 0)] = {
    q: 0, r: 0, type: 'start', faceUp: true, markers: [], blockedFor: [],
  };

  // 12 тайлов рубашкой вверх вокруг центра.
  for (const s of ring(0, 0, 1).concat(ring(0, 0, 2))) {
    tiles[keyOf(s.q, s.r)] = {
      q: s.q, r: s.r, type: reserve.shift(), faceUp: false, markers: [], blockedFor: [],
    };
  }

  const nodeHexCount = Object.values(tiles).filter((t) =>
    Object.prototype.hasOwnProperty.call(TILE_INFO, t.type)
  ).length;
  const markersPerPlayer = markerLimit(players.length, nodeHexCount);
  for (const p of players) p.markersLeft = markersPerPlayer;

  return {
    seed,
    rngState: rng.state,
    status: 'lobby',            // lobby -> playing -> finished
    players,
    currentIndex: 0,
    round: 1,
    phase: 1,
    actionsLeft: 0,
    tiles,
    reserve,
    market: {
      basic: dealMarket('basic', rng),
      medium: dealMarket('medium', rng),
      strong: dealMarket('strong', rng),
    },
    routerPlaced: false,
    routerOwner: null,
    finalRoundsLeft: null,
    pending: null,
    log: [],
    winnerId: null,
    finalScores: null,
    peek: {},                   // playerId -> { "q,r": type } — приватные подсказки Сниффера
    turnSnapshot: null,
  };
}

function dealMarket(level, rng) {
  return shuffle(CARDS.filter((c) => c.level === level).map((c) => c.id), rng);
}

export const currentPlayer = (g) => g.players[g.currentIndex];
export const playerById = (g, id) => g.players.find((p) => p.id === id);
export const hasCard = (p, id) => p.cards.some((c) => c.id === id && c.armed);
export const hasPassive = (p, id) =>
  p.cards.some((c) => c.id === id && c.armed && (c.type === 'passive' || byId(id).type === 'passive'));

export function log(g, text, extra = {}) {
  g.log.push({ t: Date.now(), round: g.round, phase: g.phase, text, ...extra });
  if (g.log.length > 500) g.log.shift();
}

/* --------------------------- ЦИКЛ И ХОД --------------------------- */

export function startGame(g) {
  if (g.status !== 'lobby') return { error: 'Партия уже начата' };
  if (g.players.length < 2) return { error: 'Нужно минимум 2 игрока' };
  g.status = 'playing';
  g.currentIndex = 0;
  log(g, 'Сеть инициализирована. Фаза 1: Экспансия и изоляция.');
  return beginTurn(g);
}

export function beginTurn(g) {
  const p = currentPlayer(g);
  g.peek[p.id] = null; // подсказки Сниффера живут только внутри хода

  // Купленные карты «включаются» с началом следующего хода владельца.
  for (const c of p.cards) {
    if (!c.armed) c.armed = true;
    c.used = false;
  }

  if (p.skipTurns > 0) {
    p.skipTurns -= 1;
    log(g, `${p.name} пропускает ход — блокировка «Карантин-зона».`, { playerId: p.id });
    return advanceTurn(g);
  }

  g.actionsLeft = hasPassive(p, 'ai_upgrade') ? 3 : 2;
  g.actionsSpent = 0;   // сколько действий уже потрачено — нужно для права на досрочный пас
  g.turnSnapshot = {
    points: Object.fromEntries(g.players.map((x) => [x.id, x.points])),
    coins: Object.fromEntries(g.players.map((x) => [x.id, x.coins])),
  };
  log(g, `Ход ${p.name} · действий ${g.actionsLeft}.`, { playerId: p.id });
  return { ok: true };
}

export function advanceTurn(g) {
  g.currentIndex = (g.currentIndex + 1) % g.players.length;

  if (g.currentIndex === 0) {
    g.round += 1;

    if (g.finalRoundsLeft !== null && g.status === 'playing') {
      g.finalRoundsLeft -= 1;
      if (g.finalRoundsLeft <= 0) return finishGame(g, 'финальные круги истекли');
    }

    const newPhase = phaseForRound(g.round);
    if (newPhase !== g.phase) {
      g.phase = newPhase;
      endCycle(g);
      if (g.status === 'finished') return { ok: true };
    }

    if (g.round > HARD_ROUND_CAP && !g.routerPlaced) {
      return finishGame(g, 'исчерпан лимит кругов');
    }
  }
  return beginTurn(g);
}

/**
 * Конец цикла (каждые 5 кругов): выплата дохода + перезагрузка разовых способностей.
 *
 * Доход = сумма очковой ценности удержанных узлов, выданная Ко́инами.
 * Сами очки при этом не трогаются — это отдельный несгораемый счёт.
 */
export function endCycle(g) {
  const paying = INCOME_AFTER_ROUTER || !g.routerPlaced;

  for (const p of g.players) {
    let income = 0;
    let held = 0;

    for (const t of Object.values(g.tiles)) {
      const mine = t.markers.filter((m) => m.playerId === p.id && !isBlocked(t, p.id)).length;
      if (!mine) continue;
      held += mine;
      const per = INCOME_BY_TILE[t.type] ?? 0;
      income += per * mine;
    }
    if (hasPassive(p, 'stealth_miner')) income += Math.floor(held / 2);

    p.coins += income;
    if (income > 0) {
      log(g, `Доход ${p.name}: +${income} C (${held} узл. под контролем).`, { playerId: p.id, income });
    }
  }

  for (const p of g.players) for (const c of p.cards) c.used = false;
  log(g, `Цикл ${g.phase} завершён: способности перезагружены, рынок в силе.`);

  if (!paying) log(g, 'Маршрутизатор в сети — доход больше не выплачивается.');
}

/** Заблокирован ли маркер конкретного игрока на тайле (Ransomware). */
export const isBlocked = (tile, playerId) =>
  (tile.blockedFor ?? []).some((b) => b.playerId === playerId);

/* --------------------------- ФИНАЛ --------------------------- */

export function checkRouterTrigger(g) {
  if (g.routerPlaced) return false;
  const p = currentPlayer(g);
  if (p.points < POINTS_TO_TRIGGER) return false;

  const slots = expansionSlots(g);
  if (!slots.length) return false;

  // Маршрутизатор появляется автоматически на случайном свободном краю сети.
  const rng = makeRng(g.rngState);
  const slot = slots[Math.floor(rng.next() * slots.length)];
  g.rngState = rng.state;
  g.routerPlaced = true;
  g.finalRoundsLeft = null;
  g.tiles[keyOf(slot.q, slot.r)] = {
    q: slot.q, r: slot.r, type: 'router', faceUp: true, markers: [], blockedFor: [],
  };
  g.pending = null;
  log(g, `${p.name} набрал ${POINTS_TO_TRIGGER} очков — Центральный Маршрутизатор автоматически появился на карте (q${slot.q}, r${slot.r}). Взлом на 6 завершает партию.`);
  return true;
}

function expansionSlots(g) {
  const seen = new Map();
  for (const t of Object.values(g.tiles)) {
    for (const [dq, dr] of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) {
      const q = t.q + dq; const r = t.r + dr;
      const k = keyOf(q, r);
      if (!g.tiles[k]) seen.set(k, { q, r });
    }
  }
  return [...seen.values()];
}
export { expansionSlots };

/**
 * Финальный подсчёт.
 *  cumulative — сумма всех захватов за партию (очки вообще не отнимаются).
 *  holdings   — только удержанные узлы на момент финала.
 */
export function finalScore(g, p) {
  let points = 0;

  if (SCORING_MODE === 'cumulative') {
    points = p.points;
    if (hasPassive(p, 'crypto_locker')) {
      const hardHeld = Object.values(g.tiles).filter(
        (t) => t.type === 'hard' && t.markers.some((m) => m.playerId === p.id),
      ).length;
      points += CRYPTO_LOCKER_BONUS * hardHeld;
    }
    return points;
  }

  for (const t of Object.values(g.tiles)) {
    const mine = t.markers.filter((m) => m.playerId === p.id).length;
    if (!mine) continue;
    points += (TILE_INFO[t.type]?.points ?? 0) * mine;
    if (t.type === 'hard' && hasPassive(p, 'crypto_locker')) points += CRYPTO_LOCKER_BONUS * mine;
  }
  return points;
}

export function finishGame(g, reason = '') {
  g.status = 'finished';
  const scored = g.players.map((p) => ({
    id: p.id,
    name: p.name,
    score: finalScore(g, p),
    coins: p.coins,
    captured: p.points,
    held: Object.values(g.tiles).filter((t) => t.markers.some((m) => m.playerId === p.id)).length,
  }));

  scored.sort((a, b) => b.score - a.score || b.coins - a.coins);

  const top = scored.filter((s) => s.score === scored[0].score);
  if (top.length > 1) {
    const rng = makeRng(g.rngState);
    for (const t of top) {
      const roll = 1 + Math.floor(rng.next() * 6);
      t.roll = roll;
      t.tiebreak = roll + t.coins;
    }
    g.rngState = rng.state;
    top.sort((a, b) => b.tiebreak - a.tiebreak);
    const winners = new Set(top.map((t) => t.id));
    const rest = scored.filter((s) => !winners.has(s.id));
    scored.splice(0, scored.length, ...top, ...rest);
    log(g, `Ничья по очкам — переброска d6 + остаток Ко́инов: ${top.map((t) => `${t.name} ${t.roll}+${t.coins}=${t.tiebreak}`).join(', ')}.`);
  }

  g.winnerId = scored[0].id;
  g.finalScores = scored;
  log(g, `Игра окончена${reason ? ` (${reason})` : ''}. Победитель: ${playerById(g, g.winnerId)?.name}.`);
  return { ok: true };
};