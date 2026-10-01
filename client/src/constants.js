/** Карта типов тайлов для интерфейса. */
export const TILE_LABEL = {
  start: 'Точка заражения',
  empty: 'Пустой гекс',
  basic: 'Базовый узел',
  medium: 'Средний узел',
  hard: 'Сложный узел',
  router: 'Центральный Маршрутизатор',
  antivirus: 'Антивирус',
  quarantine: 'Карантин-зона',
  ids: 'IDS-ловушка',
  unknown: 'Закрытый тайл',
};

export const NODE_TYPES = ['basic', 'medium', 'hard', 'router'];
export const TRAP_TYPES = ['antivirus', 'quarantine', 'ids'];

/** Очковая ценность — зеркало server/game/config.js (для подписей в UI). */
export const POINT_VALUE = { basic: 1, medium: 2, hard: 4, router: 6 };

/** Названия способностей. */
export const CARD_NAMES = {
  proxy_in: 'Прокси-вход', worm_exe: 'Worm.exe', adware: 'Adware',
  sniffer: 'Сниффер пакетов', script_kiddie: 'Скрипт-кидди', backdoor: 'Бэкдор',
  encryptor: 'Шифровальщик', stealth_miner: 'Майнер-невидимка',
  exploit_vbs: 'Exploit.vbs', adv_proxy: 'Продвинутый Прокси', firewall: 'Firewall',
  rootkit: 'Rootkit', code_optimizer: 'Оптимизатор кода', polymorph: 'Полиморфный движок',
  spoofing: 'Spoofing', botnet_scanner: 'Ботнет-сканер',
  zero_day: 'Zero-Day', ransomware: 'Ransomware', ddos: 'DDoS-атака',
  rootstorm: 'RootStorm', cyber_immunity: 'Кибер-иммунитет',
  crypto_locker: 'CryptoLocker', ai_upgrade: 'AI-Upgrade', logic_bomb: 'Логическая бомба',
};

/** Краткие описания для рынка и руки. */
export const CARD_TEXT = {
  proxy_in: 'Разовая. Маркер на чужой базовый/средний узел без броска. 1 C владельцу.',
  worm_exe: 'Перемещение на 2 гекса вместо 1.',
  adware: '+1 C к куше за каждый успешный классический взлом.',
  sniffer: 'Подсмотреть закрытые тайлы у Ядра. Видите только вы.',
  script_kiddie: '+1 к броску при взломе средних узлов.',
  backdoor: 'Разовая, 1 действие. Прыжок Ядра на ваш узел.',
  encryptor: 'Маркеры на базовых узлах нельзя атаковать.',
  stealth_miner: 'В конце цикла +1 C за каждые 2 ваших маркера.',
  exploit_vbs: 'Открывает Атаку. +1 к боевому броску.',
  adv_proxy: 'Разовая. Прыжок на сложный узел без броска. 2 C в банк.',
  firewall: '+2 к защите ваших маркеров.',
  rootkit: 'Иммунитет к Антивирусу и IDS-ловушке.',
  code_optimizer: 'Сильные карты дешевле на 1 C.',
  polymorph: 'Разовая. Смена базовой способности на другую с рынка.',
  spoofing: 'Разовая. Обмен маркерами на соседних базовых узлах.',
  botnet_scanner: 'При расширении тянуть 2 тайла и выбрать один.',
  zero_day: 'Разовая. Авто-успех на сложном узле. Маршрутизатор не берёт.',
  ransomware: 'Разовая. Шифрует чужой маркер на общем узле. Дань 3 C.',
  ddos: 'Разовая, 1 действие. Соперники в 1 гексе теряют 2 C.',
  rootstorm: 'Успешная атака заменяет маркер врага вашим.',
  cyber_immunity: 'Проходите Карантин без остановки.',
  crypto_locker: '+2 очка за каждый ваш маркер на сложных узлах в финале.',
  ai_upgrade: '3 действия в ход вместо 2.',
  logic_bomb: 'Разовая. Рвёт пустой/базовый узел вместе с маркерами.',
};

/** Что карте нужно от игрока. Дублирует targeting из движка. */
export const TARGETING = {
  none: null,
  ownNode: 'hex',
  anyNode: 'hex',
  enemyMarker: 'hex',
  adjacentBasic: 'hex',
  ownBasicCard: 'ownCard',
};

export const PHASE_INFO = {
  1: { name: 'Экспансия и изоляция', hint: 'Агрессия запрещена. Копите Ко́ины и достраивайте сеть.' },
  2: { name: 'Интеграция и конфликт', hint: 'Можно взламывать занятые узлы и атаковать с Exploit.vbs.' },
  3: { name: 'Сингулярность и штурм', hint: 'Полный хаос: бомбы, Ransomware, штурм Маршрутизатора.' },
};

export const COLOR_HEX = {
  red: '#ff4d5e', blue: '#3aa7ff', green: '#39d98a', yellow: '#ffcc33',
};

export const LEVEL_LABEL = { basic: 'Базовый', medium: 'Средний', strong: 'Сильный' };
export const LEVEL_COST = { basic: 2, medium: 4, strong: 6 };
