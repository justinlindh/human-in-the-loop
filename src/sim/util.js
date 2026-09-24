export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const sum = (arr, fn = (x) => x) => arr.reduce((acc, x) => acc + fn(x), 0);

export const avg = (arr, fn = (x) => x) => (arr.length ? sum(arr, fn) / arr.length : 0);

export function round(v, dp = 0) {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

// "an Architect", "a UX Lead", "a Tech Lead". Acronyms starting with U take "a".
export function article(word) {
  const an = /^[aeio]/i.test(word) || (/^u/i.test(word) && !/^U[A-Z]/.test(word));
  return `${an ? 'an' : 'a'} ${word}`;
}

export function newId(state, prefix) {
  return `${prefix}${state.nextId++}`;
}

export const WEEKS_PER_YEAR = 52;
export const START_YEAR = 2026;

export function dateOf(week) {
  const yearIndex = Math.floor(week / WEEKS_PER_YEAR);
  const w = week % WEEKS_PER_YEAR;
  return { year: START_YEAR + yearIndex, yearIndex, week: w + 1, quarter: Math.min(4, Math.floor(w / 13) + 1) };
}
