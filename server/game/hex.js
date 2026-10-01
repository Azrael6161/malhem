// Аксиальные гекс-координаты (q, r), pointy-top.
export const DIRS = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
];

export const keyOf = (q, r) => `${q},${r}`;
export const parseKey = (k) => {
  const [q, r] = k.split(',').map(Number);
  return { q, r };
};

export function neighbors(q, r) {
  return DIRS.map(([dq, dr]) => ({ q: q + dq, r: r + dr }));
}

export function distance(a, b) {
  return (
    Math.abs(a.q - b.q) +
    Math.abs(a.q + a.r - b.q - b.r) +
    Math.abs(a.r - b.r)
  ) / 2;
}

/** Все гексы на расстоянии ровно n от центра (кольцо). */
export function ring(q, r, n) {
  if (n === 0) return [{ q, r }];
  const out = [];
  let cur = { q: q + DIRS[4][0] * n, r: r + DIRS[4][1] * n };
  for (let d = 0; d < 6; d++) {
    for (let i = 0; i < n; i++) {
      out.push({ ...cur });
      cur = { q: cur.q + DIRS[d][0], r: cur.r + DIRS[d][1] };
    }
  }
  return out;
}

/** Все гексы в радиусе n включительно. */
export function within(q, r, n) {
  const out = [];
  for (let dq = -n; dq <= n; dq++) {
    for (let dr = Math.max(-n, -dq - n); dr <= Math.min(n, -dq + n); dr++) {
      out.push({ q: q + dq, r: r + dr });
    }
  }
  return out;
}

/** Аксиальные координаты -> пиксели (pointy-top). */
export function toPixel(q, r, size) {
  return {
    x: size * Math.sqrt(3) * (q + r / 2),
    y: size * 1.5 * r,
  };
}
