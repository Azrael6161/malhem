import { createGame, startGame, currentPlayer, playerById } from '../game/state.js';
import * as A from '../game/actions.js';
import { keyOf, neighbors } from '../game/hex.js';
import { TILE_INFO } from '../game/tiles.js';
import { CARDS } from '../game/cards.js';

const HACKABLE = ['basic', 'medium', 'hard'];

/** Один «тик» бота: пробует несколько действий, пока ход не перейдёт к другому. */
function botTurn(g, pid, style) {
  let guard = 0;
  while (guard++ < 12) {
    const c = currentPlayer(g);
    if (c.id !== pid || g.status !== 'playing') return;

    if (g.pending) {
      if (g.pending.playerId !== pid) return;
      const slot = g.pending.options?.[0];
      if (!slot) return;
      const type = g.pending.type;
      if (type === 'place_router') A.placeRouter(g, pid, slot);
      else if (type === 'place_tile') A.placeTile(g, pid, slot);
      else if (type === 'choose_expansion') { A.chooseExpansion(g, pid, 0); A.placeTile(g, pid, A.expansionSlots(g)[0]); }
      else if (type === 'choose_drop') A.chooseDrop(g, pid, g.pending.options[0].uid);
      continue;
    }

    if (g.actionsLeft <= 0) { A.pass(g, pid); continue; }

    const p = playerById(g, pid);
    const here = g.tiles[keyOf(p.core.q, p.core.r)];
    const info = TILE_INFO[here?.type];

    // 1) Атака в фазе 2+ (агрессор)
    if (style === 'aggressor' && g.phase >= 2 && p.cards.some((c) => c.id === 'exploit_vbs' && c.armed)) {
      const victim = here?.markers.find((m) => m.playerId !== pid);
      if (victim && !A.attack(g, pid, victim.playerId).error) continue;
    }

    // 2) Взлом того, на чём стоим
    if (info?.difficulty && here.type !== 'router' &&
        !here.markers.some((m) => m.playerId === pid) &&
        (here.markers.length === 0 || g.phase >= 2)) {
      if (!A.hack(g, pid, 'classic').error) continue;
    }

    // 3) Покупка (эконом-стиль в приоритете; карты включаются со следующего хода)
    if (style === 'economist' || g.actionsLeft >= 1) {
      let bought = false;
      for (const lvl of ['basic', 'medium', 'strong']) {
        for (const id of g.market[lvl]) {
          const card = CARDS.find((c) => c.id === id);
          const cost = card.level === 'strong' && p.cards.some((c) => c.id === 'code_optimizer') ? 5 : card.level === 'strong' ? 6 : card.level === 'medium' ? 4 : 2;
          if (p.coins >= cost + (style === 'economist' ? 2 : 0)) {
            if (!A.buy(g, pid, id).error) { bought = true; break; }
          }
        }
        if (bought) break;
      }
      if (bought && style === 'economist') continue;
    }

    // 4) Шаг к ближайшей полезной цели (BFS)
    const range = p.cards.some((c) => c.id === 'worm_exe' && c.armed) ? 2 : 1;
    const seen = new Set([keyOf(p.core.q, p.core.r)]);
    const queue = [{ q: p.core.q, r: p.core.r, d: 0 }];
    let acted = false;
    while (queue.length && !acted) {
      const cur = queue.shift();
      if (cur.d > 0) {
        const t = g.tiles[keyOf(cur.q, cur.r)];
        const ti = TILE_INFO[t?.type];
        const blind = t && !t.faceUp;
        const openNode = ti?.difficulty && t.type !== 'router' &&
          !t.markers.some((m) => m.playerId === pid) && (t.markers.length === 0 || g.phase >= 2);
        if ((blind || openNode) && !A.move(g, pid, { q: cur.q, r: cur.r }).error) { acted = true; break; }
      }
      if (cur.d >= range) continue;
      for (const n of neighbors(cur.q, cur.r)) {
        const k = keyOf(n.q, n.r);
        if (seen.has(k) || !g.tiles[k]) continue;
        seen.add(k);
        queue.push({ ...n, d: cur.d + 1 });
      }
    }
    if (acted) continue;

    // 5) Нечего делать
    const r = A.pass(g, pid);
    if (r.error) return;
  }
}

function run(seed, players, styles, maxTicks = 6000) {
  const g = createGame({ seed, playerDefs: players.map((n, i) => ({ id: `p${i}`, name: n })) });
  startGame(g);
  let ticks = 0;
  let stalls = 0;
  while (g.status === 'playing' && ticks < maxTicks) {
    const c = currentPlayer(g);
    const before = `${c.id}|${g.round}|${g.actionsLeft}|${g.pending?.type ?? '-'}|${Object.keys(g.tiles).length}`;
    const idx = g.players.indexOf(c);
    botTurn(g, c.id, styles[idx % styles.length]);
    const after = `${currentPlayer(g).id}|${g.round}|${g.actionsLeft}|${g.pending?.type ?? '-'}|${Object.keys(g.tiles).length}`;
    if (before === after) {
      stalls++;
      A.endTurn(g); // принудительно двигаем игру, чтобы измерить именно движок
    }
    ticks++;
  }
  const scores = g.finalScores ?? g.players.map((p) => ({ name: p.name, score: p.points }));
  const byId = Object.fromEntries(scores.map((s) => [s.name, s.score]));
  return {
    seed, round: g.round, status: g.status, ticks,
    router: g.routerPlaced,
    tiles: Object.keys(g.tiles).length,
    reserve: g.reserve.length,
    scores: g.players.map((p) => `${p.name}:${byId[p.name] ?? p.points}`).join(' '),
    cardsBought: g.players.reduce((n, p) => n + p.cards.length, 0),
    markers: g.players.reduce((n, p) => n + (10 - p.markersLeft), 0),
    winner: g.finalScores ? g.players.find((p) => p.id === g.winnerId)?.name : null,
    stalls,
  };
}

const NAMES2 = ['Аня', 'Боб'];
const NAMES4 = ['Аня', 'Боб', 'Вика', 'Гоша'];
const STYLES = ['balanced', 'economist', 'aggressor', 'balanced'];

console.log('=== 2 игрока ===');
let finished = 0;
for (const s of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
  const r = run(s, NAMES2, STYLES);
  if (r.status === 'finished') finished++;
  console.log(`seed ${String(s).padStart(2)}: круг ${String(r.round).padStart(2)} ${r.status.padEnd(8)} | маршрутизатор ${r.router ? 'ДА ' : 'нет'} | ${r.scores} | тайлов ${r.tiles} | карт ${r.cardsBought} | маркеров ${r.markers} | тупиков ${r.stalls}`);
}
console.log(`завершено ${finished}/10`);

console.log('\n=== 4 игрока ===');
finished = 0;
for (const s of [11, 12, 13, 14, 15, 16, 17, 18]) {
  const r = run(s, NAMES4, STYLES);
  if (r.status === 'finished') finished++;
  console.log(`seed ${String(s).padStart(2)}: круг ${String(r.round).padStart(2)} ${r.status.padEnd(8)} | маршрутизатор ${r.router ? 'ДА ' : 'нет'} | ${r.scores} | тайлов ${r.tiles} | карт ${r.cardsBought} | победитель ${r.winner ?? '—'}`);
}
console.log(`завершено ${finished}/8`);
