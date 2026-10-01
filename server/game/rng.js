/**
 * Сериализуемый ГПСЧ.
 * Состояние — одно 32-битное число, поэтому партия целиком восстанавливается
 * из БД без потери детерминизма (важно для тестов и реконнектов).
 */
export function nextRandom(state) {
  const a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: a };
}

export function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Бросок 1d6 — использует общее rng-состояние, пишет результат в rng.lastRoll. */
export function rollD6(rng) {
  const { value, state } = nextRandom(rng.state);
  rng.state = state;
  const roll = 1 + Math.floor(value * 6);
  rng.lastRoll = roll;
  return roll;
}

export function makeRng(seed) {
  return {
    state: seed >>> 0,
    next() {
      const { value, state } = nextRandom(this.state);
      this.state = state;
      return value;
    },
  };
}
