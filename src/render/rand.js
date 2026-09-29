// Seeded choices for the renderer: who reacts to a post, who joins a moment, where a pet goes. A
// draw is fixed by the game's seed and week, the stream it names (what it is for, and whose it
// is) and how many draws that stream has made this week. So a saved state replays the same people
// however the page loaded and whatever else drew numbers first (three.js object ids, particles).
// It never touches the sim's rng: games play the same with or without it. Draws made while the
// renderer is built, before any state is synced, come from a fixed starting stream, so a browser
// page and a Node harness agree from the first frame.

const FNV = 2166136261;
let salt = FNV;
const counts = new Map();

function mix(h, part) {
  for (const ch of String(part)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return Math.imul(h ^ 0x1f, 16777619);
}

function unit(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Called when a renderer is created: back to the starting stream.
export function reset() {
  salt = FNV;
  counts.clear();
}

// Called with each state the renderer syncs; a new seed or week starts every stream afresh.
export function reseed(seed, week) {
  const s = mix(mix(FNV, seed ?? 0), week ?? 0);
  if (s === salt) return;
  salt = s;
  counts.clear();
}

// The next number in [0, 1) of the stream named by `key` (for example 'post', or 'mood', staffId).
export function draw(...key) {
  let h = salt;
  for (const k of key) h = mix(h, k);
  const n = counts.get(h) ?? 0;
  counts.set(h, n + 1);
  return unit(mix(h, n));
}

// A number in [0, 1) that is the same on every call with this key, until the week changes.
export function fixed(...key) {
  let h = salt;
  for (const k of key) h = mix(h, k);
  return unit(h);
}

export const between = (a, b, ...key) => a + draw(...key) * (b - a);

export const pick = (list, ...key) => list[Math.floor(draw(...key) * list.length)];

// A shuffled copy (Fisher-Yates; a random sort comparator is biased and engine-dependent).
export function shuffled(list, ...key) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(draw(...key) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
