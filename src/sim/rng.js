// Seeded mulberry32. The generator is a plain { s } object so it lives in game state and survives JSON.

export function createRng(seed) {
  return { s: (Number(seed) >>> 0) };
}

export function next(r) {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const range = (r, a, b) => a + next(r) * (b - a);

export const int = (r, a, b) => a + Math.floor(next(r) * (b - a + 1));

export const pick = (r, arr) => arr[Math.floor(next(r) * arr.length)];

export const chance = (r, p) => next(r) < p;

export function weighted(r, items, weightFn) {
  const ws = items.map((x) => Math.max(0, weightFn(x) || 0));
  const total = ws.reduce((a, b) => a + b, 0);
  if (!items.length) return null;
  if (total <= 0) return pick(r, items);
  let roll = next(r) * total;
  for (let i = 0; i < items.length; i++) {
    if (ws[i] <= 0) continue;
    roll -= ws[i];
    if (roll < 0) return items[i];
  }
  for (let i = items.length - 1; i >= 0; i--) if (ws[i] > 0) return items[i];
  return null;
}

export function shuffle(r, arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next(r) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
