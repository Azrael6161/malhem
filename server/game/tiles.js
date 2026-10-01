import { shuffle } from './rng.js';
import { POINT_VALUE, CAPTURE_BOUNTY } from './config.js';

/**
 * Состав тайлов — строго по таблице компонентов (она источник истины).
 * 53 тайла узлов/ловушек + стартовая «Точка заражения» + Центральный Маршрутизатор.
 */
export const TILE_COUNTS = {
  empty: 15,
  basic: 12,
  medium: 10,
  hard: 6,
  antivirus: 4,
  quarantine: 4,
  ids: 2,
};

export const TILE_INFO = {
  start: { kind: 'start', label: 'Точка заражения' },
  empty: { kind: 'empty', label: 'Пустой гекс', difficulty: null },
  basic: { kind: 'node', label: 'Базовый узел', difficulty: 1,
    points: POINT_VALUE.basic, coins: CAPTURE_BOUNTY.basic },
  medium: { kind: 'node', label: 'Средний узел', difficulty: 4,
    points: POINT_VALUE.medium, coins: CAPTURE_BOUNTY.medium },
  hard: { kind: 'node', label: 'Сложный узел', difficulty: 5,
    points: POINT_VALUE.hard, coins: CAPTURE_BOUNTY.hard },
  router: { kind: 'node', label: 'Центральный Маршрутизатор', difficulty: 6,
    points: POINT_VALUE.router, coins: CAPTURE_BOUNTY.router },
  antivirus: { kind: 'trap', trap: 'antivirus', label: 'Антивирус', coins: 2 },
  quarantine: { kind: 'trap', trap: 'quarantine', label: 'Карантин-зона' },
  ids: { kind: 'trap', trap: 'ids', label: 'IDS-ловушка' },
};

/** Стартовое поле: кольца 1 и 2 вокруг центра = ровно 12 тайлов. */
export const START_TILES = 12;

export const isNode = (type) => TILE_INFO[type]?.kind === 'node';
export const isTrap = (type) => TILE_INFO[type]?.kind === 'trap';
export const isHackable = (type) => isNode(type);

export function buildReserve(rand) {
  const tiles = [];
  for (const [type, count] of Object.entries(TILE_COUNTS)) {
    for (let i = 0; i < count; i++) tiles.push(type);
  }
  return shuffle(tiles, rand);
}
