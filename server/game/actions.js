import { keyOf, neighbors, distance } from './hex.js';
import { TILE_INFO, isNode, isTrap } from './tiles.js';
import { byId, costFor, CARD_LEVELS, conflictsWith } from './cards.js';
import { rollD6 } from './rng.js';
import {
  currentPlayer, playerById, log, advanceTurn, hasPassive,
  checkRouterTrigger, expansionSlots, finishGame,
} from './state.js';
import { RANSOM_COST, MARKERS_PER_PLAYER, CAPTURE_BOUNTY } from './config.js';

const fail = (error) => ({ error });
const KEY = (c) => keyOf(c?.q ?? NaN, c?.r ?? NaN);
const spendAction = (g) => {
  g.actionsLeft = Math.max(0, g.actionsLeft - 1);
  g.actionsSpent = (g.actionsSpent ?? 0) + 1;
};

function checkTurn(g, playerId) {
  return g.status === 'playing' && currentPlayer(g)?.id === playerId;
}

/**
 * Единый страж: не твой ход / незакрытый шаг / ход исчерпан.
 * Если действия кончились — это не ошибка, а переход к обязательному расширению.
 */
function blocked(g, playerId) {
  if (!checkTurn(g, playerId)) return fail('Не ваш ход');
  if (g.pending) return fail('Сначала завершите текущий шаг');
  if (g.actionsLeft <= 0) {
    afterAction(g);
    return fail('Действия закончились — расширяйте сеть');
  }
  return null;
}

/* ------------------------- ВЫПЛАТА ДАНИ ------------------------- */

/** Снять блокировку Ransomware: доступно в любой момент, действий не тратит. */
export function payRansom(g, playerId, tileKey) {
  const p = playerById(g, playerId);
  const tile = g.tiles[tileKey];
  if (!p || !tile) return fail('Нет такого узла');

  const block = (tile.blockedFor ?? []).find((b) => b.playerId === playerId);
  if (!block) return fail('Этот узел не заблокирован для вас');
  if (p.coins < RANSOM_COST) return fail(`Нужно ${RANSOM_COST} C, чтобы снять блокировку`);

  p.coins -= RANSOM_COST;
  const owner = playerById(g, block.by);
  if (owner) owner.coins += RANSOM_COST;

  tile.blockedFor = tile.blockedFor.filter((b) => b !== block);
  log(g, `${p.name} платит ${RANSOM_COST} C — блокировка снята, дань уходит ${owner?.name ?? 'в банк'}.`, { playerId: p.id });
  return { ok: true };
}

/* ------------------------- ХОД И ПЕРЕХОДЫ ------------------------- */

/** После действия: триггер Маршрутизатора → проверка «есть чем заняться» → расширение. */
export function afterAction(g) {
  if (g.status !== 'playing') return { ok: true };
  if (checkRouterTrigger(g)) return { ok: true, awaiting: 'place_router' };

  const p = currentPlayer(g);
  if (g.actionsLeft > 0 && hasLegalAction(g, p.id)) return { ok: true };
  if (g.actionsLeft > 0) {
    log(g, `${p.name}: доступных действий не осталось — расширение сети.`, { playerId: p.id });
    g.actionsLeft = 0;
  }
  return requestExpansion(g);
}

export function requestExpansion(g) {
  const p = currentPlayer(g);
  if (!g.reserve.length) {
    log(g, `${p.name}: Резерв Сети пуст, расширение невозможно.`, { playerId: p.id });
    return endTurn(g);
  }
  const slots = expansionSlots(g);
  if (!slots.length) return endTurn(g);

  if (hasPassive(p, 'botnet_scanner')) {
    const options = g.reserve.slice(0, 2).map((type, index) => ({ index, type }));
    g.pending = { type: 'choose_expansion', playerId: p.id, options };
    log(g, `${p.name} сканирует резерв: видит ${options.length} тайла, выбирает один.`, { playerId: p.id });
    return { ok: true, awaiting: 'choose_expansion' };
  }

  g.pending = { type: 'place_tile', playerId: p.id, options: slots };
  log(g, `${p.name} обязан расширить сеть.`, { playerId: p.id });
  return { ok: true, awaiting: 'place_tile' };
}

export function endTurn(g) {
  g.pending = null;
  return advanceTurn(g);
}

/** Досрочная передача хода. Разрешена только если полезных действий не осталось. */
export function pass(g, playerId) {
  if (!checkTurn(g, playerId)) return fail('Не ваш ход');

  // Разрешаем завершить ход, если висит необязательное расширение сети.
  // Игрок имеет право отказаться от размещения тайла из резерва.
  if (g.pending) {
    if (g.pending.playerId === playerId && g.pending.type === 'place_tile') {
      g.pending = null;
      return endTurn(g);
    }
    // Любой другой pending завершать через pass нельзя —
    // там игрок обязан сделать выбор (карта, цель атаки и т.д.).
    return fail('Завершите текущий шаг');
  }

  return endTurn(g);
}

/* --------------------------- ПЕРЕМЕЩЕНИЕ --------------------------- */

export function move(g, playerId, to) {
  const b = blocked(g, playerId);
  if (b) return b;
  const p = playerById(g, playerId);

  const target = g.tiles[KEY(to)];
  if (!target) return fail('Тайла нет на поле');
  const range = hasPassive(p, 'worm_exe') ? 2 : 1;
  if (distance(p.core, to) > range) return fail(`Слишком далеко — максимум ${range} гекс(а)`);

  p.core = { q: to.q, r: to.r };

  let revealed = null;
  if (!target.faceUp) {
    target.faceUp = true;
    revealed = target.type;
    log(g, `${p.name} вскрывает тайл: ${TILE_INFO[target.type]?.label ?? target.type}.`, { playerId: p.id });
  }

  spendAction(g);

  if (isTrap(target.type)) {
    const res = applyTrap(g, p, target);
    if (res?.awaiting) return res;
    if (res?.endedTurn) return endTurn(g);
  }
  if (g.status !== 'playing') return { ok: true };
  return { ...afterAction(g), revealed };
}

function applyTrap(g, p, tile) {
  const info = TILE_INFO[tile.type];
  switch (info.trap) {
    case 'antivirus': {
      if (hasPassive(p, 'rootkit')) {
        log(g, `${p.name} игнорирует Антивирус — Rootkit.`, { playerId: p.id });
        return null;
      }
      if (p.coins >= info.coins) {
        p.coins -= info.coins;
        log(g, `${p.name} платит ${info.coins} C Антивирусу.`, { playerId: p.id });
      } else {
        p.skipActions += 1;
        log(g, `${p.name} не может заплатить — теряет следующее действие.`, { playerId: p.id });
      }
      return null;
    }
    case 'ids': {
      if (hasPassive(p, 'rootkit')) {
        log(g, `${p.name} игнорирует IDS-ловушку — Rootkit.`, { playerId: p.id });
        return null;
      }
      const droppable = p.cards.filter((c) => c.level !== 'strong');
      if (!droppable.length) {
        log(g, `IDS-ловушка: ${p.name} нечего сбрасывать.`, { playerId: p.id });
        return null;
      }
      if (droppable.length === 1) {
        dropCard(g, p, droppable[0].uid);
        return null;
      }
      g.pending = {
        type: 'choose_drop',
        playerId: p.id,
        options: droppable.map((c) => ({ uid: c.uid, id: c.id, name: c.name })),
      };
      return { ok: true, awaiting: 'choose_drop' };
    }
    case 'quarantine': {
      if (hasPassive(p, 'cyber_immunity')) {
        log(g, `${p.name} проходит Карантин без остановки — Кибер-иммунитет.`, { playerId: p.id });
        return null;
      }
      p.skipTurns = 1;
      log(g, `${p.name} заблокирован Карантином: ход окончен, следующий пропущен.`, { playerId: p.id });
      return { endedTurn: true };
    }
    default:
      return null;
  }
}

function dropCard(g, p, uid) {
  const idx = p.cards.findIndex((c) => c.uid === uid);
  if (idx < 0) return;
  const [card] = p.cards.splice(idx, 1);
  g.market[card.level].push(card.id);
  log(g, `${p.name} сбрасывает «${card.name}» на рынок (IDS).`, { playerId: p.id });
}

/* ------------------------------ ВЗЛОМ ------------------------------ */

export function hack(g, playerId, mode = 'classic', opts = {}) {
  const b = blocked(g, playerId);
  if (b) return b;
  const p = playerById(g, playerId);

  const tile = g.tiles[KEY(p.core)];
  if (!tile) return fail('Вы не на тайле');
  if (tile.type === 'router') return routerHack(g, p, tile);
  if (tile.type === 'start') return fail('Точка заражения не взламывается');
  if (isTrap(tile.type)) return fail('Ловушки не взламывают — их просто проходят');
  if (tile.type === 'empty') return fail('Пустой гекс — связующее пространство, взламывать нечего');
  if (!isNode(tile.type)) return fail('Этот тайл нельзя взломать');
  if (mode === 'proxy') return proxyHack(g, p, tile);
  return classicHack(g, p, tile, opts);
}

function routerHack(g, p, tile) {
  const roll = rollD6(g);
  const difficulty = 6;
  spendAction(g);

  if (roll !== 6) {
    const result = {
      ...afterAction(g),
      roll, bonus: 0, difficulty, success: false,
      notice: `${p.name}: взлом Маршрутизатора провален (${roll} против 6)`,
    };
    log(g, `${p.name} пытается взломать Маршрутизатор: ${roll} против 6 — провал.`, { playerId: p.id });
    return result;
  }

  log(g, `${p.name} успешно взламывает Центральный Маршрутизатор: 6 против 6. Партия завершена.`, { playerId: p.id });
  const final = finishGame(g, 'Маршрутизатор успешно взломан');
  return {
    ...final,
    roll, bonus: 0, difficulty, success: true,
    notice: `${p.name}: взлом Маршрутизатора успешен (6 против 6) — партия окончена`,
  };
}

function classicHack(g, p, tile, opts) {
  const others = tile.markers.filter((m) => m.playerId !== p.id);
  const mine = tile.markers.some((m) => m.playerId === p.id);

  if (mine) return fail('У вас уже есть маркер на этом узле');
  if (others.length && g.phase < 2) {
    return fail('Фаза 1: чужие узлы неприкосновенны. Нужен Прокси-вход.');
  }
  if (p.markersLeft <= 0) return fail('Маркеры контроля закончились');

  const info = TILE_INFO[tile.type];
  const isRouter = tile.type === 'router';
  const useZeroDay = !!opts.zeroDay && !isRouter &&
    p.cards.some((c) => c.id === 'zero_day' && c.armed && !c.used);

  let roll = null;
  let bonus = 0;
  let success;

  if (isRouter) {
    roll = rollD6(g);                        // чистая 6, модификаторы не работают
    success = roll === 6;
  } else if (useZeroDay) {
    success = true;
    p.cards.find((c) => c.id === 'zero_day').used = true;
    log(g, `${p.name}: Zero-Day — авто-успех на ${info.label}.`, { playerId: p.id });
  } else {
    if (tile.type === 'medium' && hasPassive(p, 'script_kiddie')) bonus += 1;
    roll = rollD6(g);
    success = roll + bonus >= info.difficulty;
  }

  spendAction(g);

  if (!success) {
    return {
      ...afterAction(g),
      roll, bonus, difficulty: info.difficulty, success: false,
      notice: `${p.name}: взлом провален (${roll}${bonus ? `+${bonus}` : ''} против ${info.difficulty})`,
    };
  }

  const gain = capture(g, p, tile);
  return {
    ...afterAction(g),
    roll, bonus, difficulty: info.difficulty, success: true, captured: true, ...gain,
    notice: `${p.name} успешно взломал узел +${gain.coins}C`,
  };
}

/** Паразитический взлом: Прокси-вход (базовый/средний) либо Продвинутый Прокси (сложный). */
function proxyHack(g, p, tile) {
  if (tile.type === 'router') return fail('К Маршрутизатору только честный бросок — нужна 6');
  if (tile.markers.some((m) => m.playerId === p.id)) return fail('У вас уже есть маркер на этом узле');
  if (p.markersLeft <= 0) return fail('Маркеры контроля закончились');

  const isHard = tile.type === 'hard';
  const cardId = isHard ? 'adv_proxy' : 'proxy_in';
  const card = p.cards.find((c) => c.id === cardId && c.armed && !c.used);
  if (!card) {
    return fail(isHard ? 'Нужна способность «Продвинутый Прокси»' : 'Нужна способность «Прокси-вход»');
  }

  const fee = isHard ? 2 : 1;
  if (p.coins < fee) return fail(`Не хватает Ко́инов — нужно ${fee} C`);

  p.coins -= fee;
  const host = tile.markers.find((m) => m.playerId !== p.id);
  if (!isHard && host) {
    const owner = playerById(g, host.playerId);
    if (owner) owner.coins += fee;          // базовый Прокси платит владельцу узла
  }

  card.used = true;
  spendAction(g);
  const gain = capture(g, p, tile);
  log(g, `${p.name} входит через ${isHard ? 'Продвинутый Прокси' : 'Прокси-вход'} на ${TILE_INFO[tile.type].label} (${fee} C).`, { playerId: p.id });
  return { ...afterAction(g), success: true, captured: true, proxy: true, ...gain };
}

/**
 * Захват узла.
 * Очки — несгораемая «сумма всех завоеваний», она же финальный результат.
 * Ко́ины — разовый куш, который сразу можно пустить на рынок.
 */
function capture(g, p, tile) {
  const info = TILE_INFO[tile.type];
  let coins = CAPTURE_BOUNTY[tile.type] ?? 0;
  if (hasPassive(p, 'adware')) coins += 1;
  const points = info.points ?? 0;

  tile.markers.push({ playerId: p.id, placedAt: g.round, via: 'hack' });
  p.markersLeft -= 1;
  p.coins += coins;
  p.points += points;

  log(g, `${p.name} захватывает ${info.label}: +${points} очк. к итогу, +${coins} C на руку.`, { playerId: p.id, points, coins });
  return { points, coins };
}

/* ------------------------------ АТАКА ------------------------------ */

export function attack(g, playerId, targetPlayerId) {
  if (!checkTurn(g, playerId)) return fail('Не ваш ход');
  if (g.pending) return fail('Сначала завершите текущий шаг');
  if (g.actionsLeft <= 0) return fail('Действия закончились');
  if (g.phase < 2) return fail('Фаза 1: агрессия запрещена');

  const p = playerById(g, playerId);
  if (!hasPassive(p, 'exploit_vbs')) return fail('Нужен боевой модуль Exploit.vbs');

  const tile = g.tiles[KEY(p.core)];
  if (!tile) return fail('Вы не на тайле');
  if (tile.type === 'router') return fail('Маршрутизатор не штурмуется атакой — только взлом на 6');

  const victim = playerById(g, targetPlayerId);
  if (!victim || victim.id === p.id) return fail('Некорректная цель');
  const mark = tile.markers.find((m) => m.playerId === targetPlayerId);
  if (!mark) return fail('На этом гексе нет маркера этого игрока');

  if (tile.type === 'basic' && hasPassive(victim, 'encryptor')) {
    return fail('Маркер защищён Шифровальщиком — базовые узлы атаковать нельзя');
  }

  spendAction(g);

  const atkBonus = 1;                                        // Exploit.vbs
  const defBonus = hasPassive(victim, 'firewall') ? 2 : 0;   // Firewall
  const aRoll = rollD6(g);
  const dRoll = rollD6(g);
  const a = aRoll + atkBonus;
  const d = dRoll + defBonus;
  const win = a >= d;                                        // ничья — в пользу атакующего

  let outcome;
  if (win && hasPassive(p, 'rootstorm')) {
    // Победивший RootStorm не создаёт второй собственный маркер на том же узле.
    const alreadyOwn = tile.markers.some((m) => m.playerId === p.id);
    if (alreadyOwn) {
      tile.markers = tile.markers.filter((m) => m !== mark);
      victim.markersLeft = Math.min(MARKERS_PER_PLAYER, victim.markersLeft + 1);
      outcome = 'RootStorm вытесняет чужой маркер — ваш уже есть на узле';
    } else if (p.markersLeft <= 0) {
      // Атака успешна, но заменить маркер нечем: чужой маркер остаётся.
      outcome = 'RootStorm не сработал — у игрока закончились маркеры';
    } else {
      tile.markers = tile.markers.filter((m) => m !== mark);
      tile.markers.push({ playerId: p.id, placedAt: g.round, via: 'rootstorm' });
      p.markersLeft -= 1;
      victim.markersLeft = Math.min(MARKERS_PER_PLAYER, victim.markersLeft + 1);
      outcome = 'RootStorm заменяет маркер';
    }
  } else if (win) {
    tile.markers = tile.markers.filter((m) => m !== mark);
    victim.markersLeft = Math.min(MARKERS_PER_PLAYER, victim.markersLeft + 1);
    outcome = 'маркер вытеснен';
  } else {
    outcome = 'атака отбита';
  }

  const notice = `${p.name} атакует узел ${victim.name} ${win ? 'успешно' : 'неуспешно'} (${a} против ${d})`;
  log(g, `${notice} — ${outcome}.`, { playerId: p.id });
  return { ...afterAction(g), attackRoll: aRoll, defenseRoll: dRoll, success: win, notice };
}

/* ------------------------------ РЫНОК ------------------------------ */

export function buy(g, playerId, cardId) {
  if (!checkTurn(g, playerId)) return fail('Не ваш ход');
  if (g.pending) return fail('Сначала завершите текущий шаг');
  if (g.round <= 1) return fail('Первый круг: рынок ещё закрыт');

  const p = playerById(g, playerId);
  const card = byId(cardId);
  if (!card) return fail('Нет такой карты');

  const conflict = conflictsWith(cardId, new Set(p.cards.map((c) => c.id)));
  if (conflict) {
    const conflictName = byId(conflict)?.name ?? conflict;
    return fail(`Нельзя купить «${card.name}»: конфликтует с «${conflictName}»`);
  }

  const multi = card.multi === true;

  if (multi) {
    // Многотиражная карта: каждый покупает один раз, экземпляр рынка не тратится.
    if (p.cards.some((c) => c.id === cardId)) {
      return fail('У вас уже есть эта способность');
    }
  } else {
    const pool = g.market[card.level];
    if (pool.indexOf(cardId) < 0) return fail('Эту карту уже купили');
  }

  const cost = costFor(card, { hasOptimizer: hasPassive(p, 'code_optimizer') });
  if (p.coins < cost) return fail(`Нужно ${cost} C, у вас ${p.coins}`);

  p.coins -= cost;

  // Обычные карты уходят с рынка навсегда, многотиражные — остаются.
  if (!multi) {
    const pool = g.market[card.level];
    pool.splice(pool.indexOf(cardId), 1);
  }

  p.cards.push({
    uid: `${cardId}-r${g.round}-${p.cards.length}`,
    id: cardId,
    level: card.level,
    type: card.type,
    armed: false,        // включится с началом следующего хода владельца
    used: false,
  });

  log(g, `${p.name} покупает «${card.name}» за ${cost} C.`, { playerId: p.id, card: cardId });
  return { ok: true };
}

/* --------------------- РАЗОВЫЕ СПОСОБНОСТИ (UI) --------------------- */

export function useAbility(g, playerId, cardId, payload = {}) {
  if (!checkTurn(g, playerId)) return fail('Не ваш ход');
  const p = playerById(g, playerId);
  const card = p.cards.find((c) => c.id === cardId && c.armed && !c.used);
  if (!card) return fail('Способность недоступна — перезарядка или ещё не включилась');

  switch (cardId) {

    case 'sniffer': {
      const found = {};
      const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
      for (const [dq, dr] of DIRS) {
        const t = g.tiles[keyOf(p.core.q + dq, p.core.r + dr)];
        if (t && !t.faceUp) found[KEY(t)] = t.type;
      }
      if (!Object.keys(found).length) return fail('Рядом нет закрытых тайлов для сканирования');

      card.used = true;
      g.peek[playerId] = { ...(g.peek[playerId] ?? {}), ...found };

      const labels = Object.values(found).map((t) => TILE_INFO[t]?.label ?? t);
      log(g, `${p.name} запускает Сниффер пакетов — видит: ${labels.join(', ')}.`, { playerId: p.id, private: true });
      return {
        ok: true,
        peek: found,
        notice: `${p.name}: Сниффер показал ${Object.keys(found).length} тайл(ов) вокруг`,
      };
    }

    case 'backdoor': {
      const target = g.tiles[KEY(payload)];
      if (!target) return fail('Укажите узел');
      if (!target.markers.some((m) => m.playerId === p.id)) return fail('Бэкдор ведёт только на ваш собственный узел');
      if (g.actionsLeft <= 0) return fail('Нужно действие');

      spendAction(g);
      card.used = true;
      p.core = { q: target.q, r: target.r };
      log(g, `${p.name} телепортируется через Бэкдор.`, { playerId: p.id });
      return afterAction(g);
    }

    case 'ddos': {
      if (g.actionsLeft <= 0) return fail('Нужно действие');
      spendAction(g);
      card.used = true;

      const hits = g.players.filter((x) => x.id !== p.id && distance(x.core, p.core) <= 1);
      for (const v of hits) {
        const lost = Math.min(2, v.coins);
        v.coins -= lost;
        log(g, `${v.name} теряет ${lost} C от DDoS-атаки.`, { playerId: v.id });
      }
      log(g, `${p.name} обрушивает DDoS на периметр — задето вирусов: ${hits.length}.`, { playerId: p.id });
      return afterAction(g);
    }

    case 'polymorph': {
      const own = p.cards.find((c) => c.uid === payload.uid && c.level === 'basic');
      if (!own) return fail('Выберите свою базовую способность');
      const newId = payload.newCardId;
      const pool = g.market.basic;
      const idx = pool.indexOf(newId);
      if (idx < 0) return fail('Такой карты нет на рынке');
      if (newId === own.id) return fail('Это ваша же способность');

      pool.splice(idx, 1);
      pool.push(own.id);
      p.cards = p.cards.filter((c) => c.uid !== own.uid);
      const fresh = byId(newId);
      p.cards.push({
        uid: `poly-r${g.round}-${p.cards.length}`,
        id: newId,
        level: 'basic',
        type: fresh.type,
        armed: true,
        used: false,
      });
      card.used = true;
      log(g, `${p.name} подменяет «${own.name}» на «${fresh.name}» — Полиморфный движок.`, { playerId: p.id });
      return { ok: true };
    }

    case 'spoofing': {
      let A = payload.a ? g.tiles[KEY(payload.a)] : null;
      let B = payload.b ? g.tiles[KEY(payload.b)] : null;

      if (!A && payload.q != null) {
        const first = g.tiles[KEY(payload)];
        if (!first) return fail('Укажите узел');
        if (!first.markers.some((m) => m.playerId === p.id)) {
          return fail('Возьмите за отправную точку узел со своим маркером');
        }
        const partner = neighbors(first.q, first.r)
          .map((n) => g.tiles[keyOf(n.q, n.r)])
          .find((t) => t && t.type === 'basic' &&
            t.markers.some((m) => m.playerId !== p.id) && t.markers.length === 1);
        if (!partner) return fail('Рядом нет соседнего базового узла с чужим маркером');
        A = first; B = partner;
      }

      if (!A || !B) return fail('Укажите два узла');
      if (A.type !== 'basic' || B.type !== 'basic') return fail('Spoofing работает только на базовых узлах');
      if (distance(A, B) !== 1) return fail('Узлы должны быть соседними');

      const myMark = A.markers.find((m) => m.playerId === p.id) ?? B.markers.find((m) => m.playerId === p.id);
      const enemyMark = (A.markers.find((m) => m.playerId !== p.id)) ?? (B.markers.find((m) => m.playerId !== p.id));
      if (!myMark || !enemyMark) return fail('Нужен ваш маркер и чужой на этих двух узлах');
      if (myMark === enemyMark) return fail('Это один и тот же маркер');

      const enemyOwner = enemyMark.playerId;
      enemyMark.playerId = p.id;
      myMark.playerId = enemyOwner;
      card.used = true;
      log(g, `${p.name} подменяет адреса (Spoofing) — маркеры меняются местами.`, { playerId: p.id });
      return { ok: true };
    }

    case 'ransomware': {
      const tile = g.tiles[KEY(payload)];
      if (!tile) return fail('Укажите узел');

      if (!tile.markers.some((m) => m.playerId === p.id)) {
        return fail('Ransomware ставится на общий узел — у вас там должен быть маркер');
      }

      const enemyMark =
        tile.markers.find((m) => m.playerId === payload.targetPlayerId) ??
        tile.markers.find((m) => m.playerId !== p.id);
      if (!enemyMark) return fail('На узле нет чужого маркера — делить нечего');

      tile.blockedFor = tile.blockedFor ?? [];
      if (tile.blockedFor.some((b) => b.playerId === enemyMark.playerId)) {
        return fail('Маркер этого игрока уже под Ransomware');
      }

      tile.blockedFor.push({ playerId: enemyMark.playerId, by: p.id, at: g.round });
      card.used = true;

      const victim = playerById(g, enemyMark.playerId);
      log(g, `${p.name} шифрует маркер ${victim.name} на общем узле. Дань за разблокировку: ${RANSOM_COST} C.`, { playerId: p.id });
      log(g, `${victim.name}: маркер под Ransomware — очки и доход с него не идут, пока не заплатите.`, { playerId: victim.id });
      return { ok: true };
    }

    case 'logic_bomb': {
      const tile = g.tiles[KEY(payload)];
      if (!tile) return fail('Укажите узел');
      if (!['empty', 'basic'].includes(tile.type)) {
        return fail('Логическая бомба рвёт только пустые и базовые гексы');
      }

      for (const m of tile.markers) {
        const owner = playerById(g, m.playerId);
        if (owner) owner.markersLeft = Math.min(MARKERS_PER_PLAYER, owner.markersLeft + 1);
      }
      const gone = TILE_INFO[tile.type].label;
      delete g.tiles[KEY(tile)];
      card.used = true;
      log(g, `${p.name} подрывает ${gone} — в матрице остаётся «дыра».`, { playerId: p.id });
      return { ok: true };
    }

    default:
      return fail('Эта способность пока недоступна для ручной активации');
  }
}

/* ------------------- ЗАВЕРШЕНИЕ ШАГОВ РАСШИРЕНИЯ ------------------- */

export function placeTile(g, playerId, slot, reserveIndex = 0) {
  const pend = g.pending;
  if (!pend || pend.playerId !== playerId) return fail('Сейчас не ваш шаг');
  const p = currentPlayer(g);

  if (pend.type === 'choose_expansion') {
    const chosen = pend.options[reserveIndex];
    if (!chosen) return fail('Выберите тайл из сканирования');
    const type = g.reserve[chosen.index];
    if (!type) return fail('Резерв пуст');
    g.reserve.splice(chosen.index, 1);

    const options = expansionSlots(g);
    if (options.length === 0) {
      log(g, `${p.name} выбирает тайл из сканирования, но расширяться некуда — ход переходит дальше.`, { playerId });
      g.pending = null;
      return endTurn(g);
    }

    g.pending = { type: 'place_tile', playerId, options, forcedType: type };
    log(g, `${p.name} выбирает тайл из сканирования.`, { playerId });
    return { ok: true, awaiting: 'place_tile' };
  }

  if (pend.type !== 'place_tile') return fail('Сейчас не ваш шаг расширения');

  if (!slot || !pend.options.some((o) => o.q === slot.q && o.r === slot.r)) {
    return fail('Тайл можно положить только к открытой грани сети');
  }

  let idx = reserveIndex;
  let type;
  if (pend.forcedType) {
    type = pend.forcedType;
    idx = g.reserve.indexOf(pend.forcedType);
  } else {
    type = g.reserve[idx];
  }
  if (!type) return fail('Резерв пуст');

  g.reserve.splice(idx, 1);
  g.tiles[KEY(slot)] = { q: slot.q, r: slot.r, type, faceUp: false, markers: [], blockedFor: [] };
  log(g, `${p.name} расширяет сеть — открыт новый гекс.`, { playerId });

  g.pending = null;
  return endTurn(g);
}

export function placeRouter(g, playerId, slot) {
  return fail('Маршрутизатор размещается автоматически');
}

export function chooseDrop(g, playerId, uid) {
  const pend = g.pending;
  if (!pend || pend.type !== 'choose_drop' || pend.playerId !== playerId) {
    return fail('Нет активного сброса');
  }
  dropCard(g, playerById(g, playerId), uid);
  g.pending = null;
  return { ok: true };
}

/* ---------------- ЕСТЬ ЛИ ЧЕМ ЗАНЯТЬСЯ В ЭТОМ ХОДУ? ---------------- */

export function hasLegalAction(g, playerId) {
  const p = playerById(g, playerId);
  if (!p || g.status !== 'playing') return false;
  const range = hasPassive(p, 'worm_exe') ? 2 : 1;

  // 1. Шаг на закрытый тайл
  for (let dq = -range; dq <= range; dq++) {
    for (let dr = Math.max(-range, -dq - range); dr <= Math.min(range, -dq + range); dr++) {
      if (!dq && !dr) continue;
      const t = g.tiles[keyOf(p.core.q + dq, p.core.r + dr)];
      if (t && !t.faceUp) return true;
    }
  }

  // 2. Взлом на текущем гексе. Маршрутизатор взламывается без маркера.
  const here = g.tiles[KEY(p.core)];
  if (here && here.type === 'router' && g.routerPlaced) return true;
  if (here && isNode(here.type) && here.type !== 'router') {
    const mine = here.markers.some((m) => m.playerId === playerId);
    const occupied = here.markers.some((m) => m.playerId !== playerId);
    if (!mine && !occupied) return true;
    if (!mine && occupied && g.phase >= 2) return true;
    if (!mine && occupied && p.cards.some((c) => ['proxy_in', 'adv_proxy'].includes(c.id))) return true;
  }

  // 3. Атака
  if (g.phase >= 2 && here && hasPassive(p, 'exploit_vbs') &&
      here.markers.some((m) => m.playerId !== playerId)) return true;

  // 4. Рынок
  for (const lvl of ['basic', 'medium', 'strong']) {
    for (const id of g.market[lvl]) {
      const card = byId(id);
      if (!card) continue;
      // Многотиражные карты, которые у игрока уже есть, не считаем «доступными» —
      // иначе система ошибочно решит, что игроку есть чем заняться.
      if (card.multi && p.cards.some((c) => c.id === id)) continue;
      if (p.coins >= costFor(card, { hasOptimizer: hasPassive(p, 'code_optimizer') })) return true;
    }
  }

  // 5. Разовые активные способности
  if (p.cards.some((c) => c.armed && !c.used &&
      ['sniffer', 'backdoor', 'ddos', 'ransomware', 'logic_bomb'].includes(c.id))) return true;

  return false;
};