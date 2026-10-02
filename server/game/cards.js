/** Реестр карт кода — ровно как в справочнике правил. */
export const CARD_LEVELS = {
  basic:  { level: 'basic',  label: 'Базовый', cost: 2 },
  medium: { level: 'medium', label: 'Средний', cost: 4 },
  strong: { level: 'strong', label: 'Сильный', cost: 6 },
};

/**
 * targeting — что карте нужно от игрока в UI:
 *   none          — жать кнопку и всё
 *   ownNode       — выбрать свой узел
 *   anyNode       — выбрать любой узел на поле
 *   enemyMarker   — выбрать чужой маркер на моём гексе
 *   adjacentBasic — выбрать два соседних базовых узла
 *   ownBasicCard  — выбрать свою базовую карту + карту с рынка
 *
 * multi: true — карта не уникальна на рынке: каждый игрок может купить
 *               её один раз, экземпляр рынка не тратится.
 */
export const CARDS = [
  // --- Базовый уровень (2 C) ---
  { id: 'proxy_in', name: 'Прокси-вход', level: 'basic', type: 'active', targeting: 'none',
    text: 'Разовая. Без броска поставить маркер на чужой базовый/средний узел. Стоит 1 C (владельцу узла или в банк).' },
  { id: 'worm_exe', name: 'Worm.exe', level: 'basic', type: 'passive',
    text: 'Перемещение на 2 гекса вместо 1.' },
  { id: 'adware', name: 'Adware', level: 'basic', type: 'passive',
    text: '+1 C к разовому кушу за каждый успешный классический взлом.' },
  { id: 'sniffer', name: 'Сниффер пакетов', level: 'basic', type: 'passive', targeting: 'none',
    text: 'Бесплатно посмотреть, что лежит под закрытыми тайлами рядом с вашим Ядром. Подсказка видна только вам.' },
  { id: 'script_kiddie', name: 'Скрипт-кидди', level: 'basic', type: 'passive',
    text: '+1 к броску при взломе средних узлов.' },
  { id: 'backdoor', name: 'Бэкдор', level: 'basic', type: 'active', targeting: 'ownNode',
    text: 'Разовая, тратит 1 действие. Телепорт Ядра на любой ваш узел.' },
  { id: 'encryptor', name: 'Шифровальщик', level: 'basic', type: 'passive',
    text: 'Ваши маркеры на базовых узлах нельзя атаковать и вытеснять.' },
  { id: 'stealth_miner', name: 'Майнер-невидимка', level: 'basic', type: 'passive',
    text: 'В конце цикла +1 C за каждые два ваших маркера на поле.' },

  // --- Средний уровень (4 C) ---
  { id: 'exploit_vbs', name: 'Exploit.vbs', level: 'medium', type: 'passive', multi: true,
    text: 'Открывает действие «Атака». +1 к боевому броску при нападении. Могут купить все игроки.' },
  { id: 'adv_proxy', name: 'Продвинутый Прокси', level: 'medium', type: 'active', targeting: 'none',
    text: 'Разовая. Без броска присосаться к сложному узлу. Стоит 2 C в банк.' },
  { id: 'firewall', name: 'Firewall', level: 'medium', type: 'passive',
    text: '+2 к защите, когда атакуют ваши маркеры.' },
  { id: 'rootkit', name: 'Rootkit', level: 'medium', type: 'passive',
    text: 'Полный иммунитет к «Антивирусу» и «IDS-ловушке».' },
  { id: 'code_optimizer', name: 'Оптимизатор кода', level: 'medium', type: 'passive',
    text: 'Карты сильного уровня дешевле на 1 C.' },
  { id: 'polymorph', name: 'Полиморфный движок', level: 'medium', type: 'active', targeting: 'ownBasicCard',
    text: 'Разовая. Бесплатно обменять свою базовую способность на любую другую базовую с рынка.' },
  { id: 'spoofing', name: 'Spoofing', level: 'medium', type: 'active', targeting: 'adjacentBasic',
    text: 'Разовая. Поменять местами свой и чужой маркер на двух соседних базовых узлах без боя.' },
  { id: 'botnet_scanner', name: 'Ботнет-сканер', level: 'medium', type: 'passive',
    text: 'При расширении сети тянуть 2 тайла, посмотреть один, второй вернуть в резерв.' },

  // --- Сильный уровень (6 C) ---
  { id: 'zero_day', name: 'Zero-Day', level: 'strong', type: 'active', targeting: 'none',
    text: 'Разовая. Авто-успех при взломе сложного узла без броска. НЕ работает на Маршрутизаторе.' },
  { id: 'ransomware', name: 'Ransomware', level: 'strong', type: 'active', targeting: 'enemyMarker',
    text: 'Разовая. Заблокировать маркер соперника на общем с вами узле. Он платит вам 3 C, чтобы снять блок.' },
  { id: 'ddos', name: 'DDoS-атака', level: 'strong', type: 'active', targeting: 'none',
    text: 'Разовая, тратит 1 действие. Все соперники в 1 гексе от вашего Ядра теряют по 2 C.' },
  { id: 'rootstorm', name: 'RootStorm', level: 'strong', type: 'passive',
    text: 'Успешная атака не убирает маркер врага, а заменяет его вашим.' },
  { id: 'cyber_immunity', name: 'Кибер-иммунитет', level: 'strong', type: 'passive',
    text: 'Полный иммунитет к «Карантину» — проходите сквозь без остановки.' },
  { id: 'crypto_locker', name: 'CryptoLocker', level: 'strong', type: 'passive',
    text: '+2 очка за каждый ваш маркер на сложных узлах при финальном подсчёте.' },
  { id: 'ai_upgrade', name: 'AI-Upgrade', level: 'strong', type: 'passive',
    text: '3 действия в ход вместо 2. Расширение сети по-прежнему 1 раз.' },
  { id: 'logic_bomb', name: 'Логическая бомба', level: 'strong', type: 'active', targeting: 'anyNode',
    text: 'Разовая. Уничтожить пустой или базовый узел вместе со всеми маркерами — «дыра» в поле.' },
];

export const byId = (id) => CARDS.find((c) => c.id === id);

/** Стоимость карты с учётом скидки Оптимизатора кода. */
export function costFor(card, { hasOptimizer = false } = {}) {
  const base = CARD_LEVELS[card.level].cost;
  return card.level === 'strong' && hasOptimizer ? Math.max(0, base - 1) : base;
}

/**
 * Таблица взаимоисключающих карт. Пары неупорядоченные:
 * если у игрока уже есть одна карта из пары, вторую купить нельзя.
 *
 * Логика подбора:
 *  - adware vs script_kiddie  — «жадность» против «точности»:
 *    либо ты зарабатываешь больше с каждой удачи, либо чаще попадаешь по средним.
 *  - encryptor vs rootstorm   — «защита» против «агрессии»:
 *    либо твой маркер нельзя трогать на базовых, либо ты вытесняешь чужие вместо удаления.
 *  - firewall vs rootstorm    — «оборона» против «нападения»:
 *    нельзя одновременно иметь лучшую защиту и лучшую замену.
 *  - ai_upgrade vs code_optimizer — «скорость» против «дешевизны»:
 *    либо больше действий, либо дешевле сильные карты.
 *  - cyber_immunity vs rootkit — две разные «иммунки» на ловушки:
 *    нельзя одновременно игнорировать и Антивирус/IDS, и Карантин.
 */
const CONFLICTS = [
  ['adware', 'script_kiddie'],
  ['encryptor', 'rootstorm'],
  ['firewall', 'rootstorm'],
  ['ai_upgrade', 'code_optimizer'],
  ['cyber_immunity', 'rootkit'],
];

/**
 * Есть ли конфликт между покупаемой картой и уже имеющимися у игрока.
 * @param {string} cardId           — id покупаемой карты
 * @param {Set<string>} ownedIds    — множество id уже имеющихся карт
 * @returns {string|null}           — id конфликтующей карты, либо null
 */
export function conflictsWith(cardId, ownedIds) {
  for (const [a, b] of CONFLICTS) {
    if (cardId === a && ownedIds.has(b)) return b;
    if (cardId === b && ownedIds.has(a)) return a;
  }
  return null;
};