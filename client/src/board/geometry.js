export function hexPath(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${cx + size * Math.cos(a)},${cy + size * Math.sin(a)}`);
  }
  return `M${pts.join('L')}Z`;
}

/** Аксиальные координаты -> пиксели (pointy-top). */
export const toPixel = (q, r, size) => ({
  x: size * Math.sqrt(3) * (q + r / 2),
  y: size * 1.5 * r,
});

export const TILE_KEY = (q, r) => `${q},${r}`;
