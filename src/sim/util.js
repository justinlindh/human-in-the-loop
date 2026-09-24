export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const sum = (arr, fn = (x) => x) => arr.reduce((acc, x) => acc + fn(x), 0);

export const avg = (arr, fn = (x) => x) => (arr.length ? sum(arr, fn) / arr.length : 0);

export function round(v, dp = 0) {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

// "an Architect", "a UX Lead", "an HR", "a CRM", "a user", "an hour": by sound, not spelling.
export function article(word) {
  const first = word.split(/[\s-]/)[0];
  let an;
  if (/^[A-Z]{2,}$/.test(first)) an = 'AEFHILMNORSX'.includes(first[0]);
  else if (/^(hour|honest|honor|heir)/i.test(first)) an = true;
  else if (/^(u[bcdfghjklmnpqrstvwxyz][aeiou]|uni|use|eu|one)/i.test(first)) an = false;
  else an = /^[aeiou]/i.test(first);
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
