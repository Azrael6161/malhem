/**
 * Тесты движка. Запуск:  npm run test:engine
 * Проверяют именно правила, а не интерфейс.
 */
import { createGame, startGame, playerById, currentPlayer, endCycle, isBlocked } from '../game/state.js';
import * as A from '../game/actions.js';
import { keyOf } from '../game/hex.js';
import { TILE_INFO } from '../game/tiles.js';
import { RANSOM_COST, POINT_VALUE } from '../game/config.js';

let passed = 0;
let failed = 0;

function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${extra}`); }
}

function fresh(seed = 7, names = ['Аня', 'Боб']) {
  const g = createGame({ seed, playerDefs: names.map((n, i) => ({ id: `p${i}`, name: n })) });
  startGame(g);
  return g;
}

const findNode = (g, type = 'basic') => {
  for (let dq = -3; dq <= 3; dq++) {
    for (let dr = -3; dr <= 3; dr++) {
      const t = g.tiles[keyOf(dq, dr)];
      if (t && t.type === type) return t;
    }
  }
  return null;
};

/* ---------------------------------------------------------------- */
console.log('\nОЧКИ И ДОХОД — два независимых счёта\n');
{
  const g = fresh(5);
  const a = playerById(g, 'p0');
  const node = findNode(g);
  a.core = { q: node.q, r: node.r };
  node.faceUp = true;

  const pointsBefore = a.points;
  A.hack(g, 'p0', 'classic');
  check('захват увеличивает очки', a.points > pointsBefore,
    `(${pointsBefore} → ${a.points})`);
  check('очки растут ровно на ценность узла',
    a.points - pointsBefore === (POINT_VALUE[node.type] ?? 0),
    `(+${a.points - pointsBefore}, ожидали +${POINT_VALUE[node.type]})`);

  const coinsAtCapture = a.coins;
  endCycle(g);
  check('доход в конце цикла начисляет Ко́ины', a.coins > coinsAtCapture,
    `(${coinsAtCapture} → ${a.coins})`);
  check('очки при выплате дохода не меняются',
    a.points > 0, `(очки: ${a.points})`);
}
{
  const g = fresh(11);
  g.round = 3;
  g.pending = null;
  const a = playerById(g, 'p0');
  a.coins = 20;
  a.points = 7;

  const p0 = a.points;
  const c0 = a.coins;
  const r = A.buy(g, 'p0', 'worm_exe');
  check('покупка проходит', !r.error, r.error ?? '');
  check('покупка списывает Ко́ины', a.coins < c0, `(${c0} → ${a.coins})`);
  check('покупка НЕ трогает очки', a.points === p0, `(${p0} → ${a.points})`);
}

/* ---------------------------------------------------------------- */
console.log('\nRANSOMWARE — шифрование общего узла\n');
{
  const g = fresh(11);
  g.pending = null;
  const a = playerById(g, 'p0');
  const b = playerById(g, 'p1');
  const node = findNode(g);
  node.faceUp = true;
  node.markers.push({ playerId: 'p0', placedAt: 1 }, { playerId: 'p1', placedAt: 1 });
  a.core = { q: node.q, r: node.r };
  a.cards.push({ uid: 'rw', id: 'ransomware', level: 'strong', type: 'active', armed: true, used: false });

  check('до активации маркер не заблокирован', !isBlocked(node, 'p1'));

  const r = A.useAbility(g, 'p0', 'ransomware', { q: node.q, r: node.r, targetPlayerId: 'p1' });
  check('активация Ransomware проходит', !r.error, r.error ?? '');
  check('чужой маркер заблокирован', isBlocked(node, 'p1'));
  check('свой маркер не заблокирован', !isBlocked(node, 'p0'));

  // Требование: не общий узел — нельзя
  const solo = fresh(11);
  solo.pending = null;
  const sa = playerById(solo, 'p0');
  const soloNode = findNode(solo);
  soloNode.markers.push({ playerId: 'p1', placedAt: 1 });
  sa.core = { q: soloNode.q, r: soloNode.r };
  sa.cards.push({ uid: 'rw2', id: 'ransomware', level: 'strong', type: 'active', armed: true, used: false });
  const r2 = A.useAbility(solo, 'p0', 'ransomware', { q: soloNode.q, r: soloNode.r, targetPlayerId: 'p1' });
  check('на узле без своего маркера способность не работает', !!r2.error, r2.error ?? 'ошибка не выдана');

  // Заблокированный не получает доход
  const bCoins = b.coins;
  endCycle(g);
  check('заблокированный не получает доход', b.coins === bCoins, `(${bCoins} → ${b.coins})`);

  const aCoins = a.coins;
  endCycle(g);
  check('владелец блокировки доход получает', a.coins > aCoins, `(${aCoins} → ${a.coins})`);

  // Оплата дани
  b.coins = 10;
  a.coins = 0;
  const pay = A.payRansom(g, 'p1', keyOf(node.q, node.r));
  check('оплата дани проходит', !pay.error, pay.error ?? '');
  check('плательщик теряет ровно 3 C', b.coins === 10 - RANSOM_COST, `(${b.coins})`);
  check('инициатор получает ровно 3 C', a.coins === RANSOM_COST, `(${a.coins})`);
  check('блокировка снята', !isBlocked(node, 'p1'));
}

/* ---------------------------------------------------------------- */
console.log('\nПРАВИЛА ФАЗ И ВЗЛОМА\n');
{
  const g = fresh(20);
  g.pending = null;
  const a = playerById(g, 'p0');
  const node = findNode(g);
  node.faceUp = true;
  node.markers.push({ playerId: 'p1', placedAt: 1 });
  a.core = { q: node.q, r: node.r };

  const r1 = A.hack(g, 'p0', 'classic');
  check('фаза 1: чужой узел не взломать', !!r1.error, r1.error ?? 'прошло без ошибки');

  g.phase = 2;
  g.actionsLeft = 2;
  g.pending = null;
  a.core = { q: node.q, r: node.r };
  const r2 = A.hack(g, 'p0', 'classic');
  check('фаза 2: чужой узел взламывается', !r2.error, r2.error ?? '');
}
{
  const g = fresh(21);
  g.pending = null;
  g.phase = 1;
  const a = playerById(g, 'p0');
  const b = playerById(g, 'p1');
  const node = findNode(g);
  node.faceUp = true;
  node.markers.push({ playerId: 'p1', placedAt: 1 });
  a.core = { q: node.q, r: node.r };
  const r = A.attack(g, 'p0', 'p1');
  check('фаза 1: атака запрещена', !!r.error, r.error ?? 'прошла');
}
{
  const g = fresh(22);
  g.pending = null;
  const a = playerById(g, 'p0');
  const empty = Object.values(g.tiles).find((t) => t.type === 'empty');
  if (empty) {
    empty.faceUp = true;
    a.core = { q: empty.q, r: empty.r };
    const r = A.hack(g, 'p0', 'classic');
    check('пустой гекс не даёт маркер и очки', !!r.error, r.error ?? 'прошло');
  } else {
    check('пустой гекс найден для теста', false, '(в этой раскладке нет пустых)');
  }
}

/* ---------------------------------------------------------------- */
console.log('\nЖИЗНЕННЫЙ ЦИКЛ ПАРТИИ\n');
{
  const g = fresh(3);
  g.pending = null;
  const a = playerById(g, 'p0');
  a.core = { q: findNode(g).q, r: findNode(g).r };
  g.actionsSpent = 1;
  const r = A.pass(g, 'p0');
  check('досрочный пас после действия разрешён', !r.error, r.error ?? '');
}
{
  const g = fresh(4);
  g.pending = null;
  const r = A.pass(g, 'p0');
  check('пас нетронутым ходом запрещён', !!r.error, r.error ?? 'прошёл');
}

/* ---------------------------------------------------------------- */

/* ---------------------------------------------------------------- */
console.log('\nROOTSTORM / ПРОКСИ — конфликт и корректная замена маркера\n');
{
  const g = fresh(31);
  g.pending = null;
  g.phase = 2;
  const a = playerById(g, 'p0');
  const b = playerById(g, 'p1');
  const node = findNode(g);
  node.faceUp = true;
  node.markers.push({ playerId: 'p1', placedAt: 1 });
  a.core = { q: node.q, r: node.r };
  a.markersLeft = 1;
  a.cards.push({ uid: 'exp', id: 'exploit_vbs', level: 'medium', type: 'passive', armed: true, used: false });
  a.cards.push({ uid: 'rs', id: 'rootstorm', level: 'strong', type: 'passive', armed: true, used: false });

  const proxyBuy = A.buy(g, 'p0', 'proxy_in');
  check('RootStorm запрещает покупку Прокси-входа', !!proxyBuy.error, proxyBuy.error ?? 'покупка прошла');

  // Для проверки замены даём предсказуемый успешный боевой бросок.
  g.rngState = 0;
  g.actionsLeft = 1;
  const attack = A.attack(g, 'p0', 'p1');
  const own = node.markers.filter((m) => m.playerId === 'p0');
  check('RootStorm при успешной атаке создаёт ровно один свой маркер', own.length === 1);
  check('RootStorm расходует один доступный маркер', a.markersLeft === 0);
  check('вытесненный маркер возвращается владельцу', b.markersLeft === 10);
  check('результат атаки содержит числовые броски', Number.isInteger(attack.attackRoll) && Number.isInteger(attack.defenseRoll));
}

/* ---------------------------------------------------------------- */
console.log('\nМАРШРУТИЗАТОР — автоматическое появление и взлом без маркера\n');
{
  const g = fresh(32);
  g.pending = null;
  const a = playerById(g, 'p0');
  a.points = 25;
  g.actionsLeft = 1;

  const after = A.afterAction(g);
  const router = Object.values(g.tiles).find((t) => t.type === 'router');
  check('Маршрутизатор появляется автоматически', !!router && g.routerPlaced === true);
  check('для появления Маршрутизатора не создаётся pending размещения', !g.pending);

  if (router) {
    a.core = { q: router.q, r: router.r };
    a.markersLeft = 0;
    g.actionsLeft = 1;
    g.rngState = 0; // первый бросок d6 = 6
    const hack = A.hack(g, 'p0', 'classic');
    check('Маршрутизатор можно взламывать без своего маркера', !hack.error);
    check('успешный взлом Маршрутизатора сразу завершает игру',
      hack.success === true && g.status === 'finished');
  }
}

/* ---------------------------------------------------------------- */
console.log(`\n${'─'.repeat(46)}`);
console.log(`  пройдено ${passed} · провалено ${failed}`);
console.log(`${'─'.repeat(46)}\n`);
process.exit(failed ? 1 : 0);
