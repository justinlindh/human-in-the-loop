import { B } from './balance.js';

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
export const START_YEAR = 2019;

export function dateOf(week) {
  const yearIndex = Math.floor(week / WEEKS_PER_YEAR);
  const w = ((week % WEEKS_PER_YEAR) + WEEKS_PER_YEAR) % WEEKS_PER_YEAR;
  return { year: START_YEAR + yearIndex, yearIndex, week: w + 1, quarter: Math.min(4, Math.floor(w / 13) + 1) };
}

// Calendar labels and world releases use the founding offset; company age is still state.week.
export const calendarWeek = (state, week = state.week) => {
  let elapsed = week;
  for (const chapter of state.founding?.earlyChapters ?? []) {
    if (elapsed < chapter.weeks) return (chapter.startYear - START_YEAR) * WEEKS_PER_YEAR
      + Math.floor(elapsed * (chapter.endYear - chapter.startYear) * WEEKS_PER_YEAR / chapter.weeks);
    elapsed -= chapter.weeks;
  }
  return elapsed + (state.founding?.calendarOffset ?? 0);
};
export const calendarDate = (state, week = state.week) => dateOf(calendarWeek(state, week));
export const earlyWeeks = (state) => sum(state.founding?.earlyChapters ?? [], (c) => c.weeks);

// The market clock: weeks since the Classic founding year on the calendar, from zero up to B.marketWeekCap, where
// the world stops getting harder. Market difficulty (clones, expectations, project size, market size, the talent
// pool) runs on it; company costs run on state.week.
export const marketWeek = (state, week = state.week) => clamp(calendarWeek(state, week), 0, B.marketWeekCap);
export const marketYear = (state, week = state.week) => Math.floor(marketWeek(state, week) / WEEKS_PER_YEAR);

// The company week an early chapter begins, or null when this timeline has no such chapter.
export function chapterStart(state, id) {
  let start = 0;
  for (const chapter of state.founding?.earlyChapters ?? []) {
    if (chapter.id === id) return start;
    start += chapter.weeks;
  }
  return null;
}
