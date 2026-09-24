// A person's track record (staff.record): the lifetime counters that fit their role, zeros hidden.
// Shown only once the sim fills the record's work counters.

import { fmtMoney, fmtNum } from './dom.js';

export const RECORD = {
  salesMrr: { label: 'in new MRR', fmt: (v) => fmtMoney(v), top: 'Top seller' },
  deals: { label: 'deals', one: 'deal', top: 'Top closer' },
  features: { label: 'features', one: 'feature', top: 'Top builder' },
  prsMerged: { label: 'PRs merged', one: 'PR merged' },
  launches: { label: 'launches', one: 'launch', top: 'Most launches' },
  tickets: { label: 'tickets', one: 'ticket', top: 'Top support' },
  incidentsCaught: { label: 'incidents caught', one: 'incident caught', top: 'Top catcher' },
  mentored: { label: 'people mentored', one: 'person mentored', top: 'Top mentor' },
};
const KEYS = Object.keys(RECORD);

// The role's own numbers first; the rest follow in RECORD order.
const ROLE_FIRST = {
  sales: ['salesMrr', 'deals'],
  engineer: ['features', 'prsMerged', 'launches'],
  designer: ['features', 'launches'],
  support: ['tickets'],
  security: ['incidentsCaught'],
  marketer: ['launches'],
};

export const hasRecord = (p) => KEYS.some((k) => Number.isFinite(p?.record?.[k]));

// Non-zero stats for a person, role-first, oversight catches first for anyone on oversight duty.
export function recordStats(p) {
  if (!hasRecord(p)) return [];
  const first = [...(p.assignment?.type === 'oversight' ? ['incidentsCaught'] : []), ...(ROLE_FIRST[p.role] ?? [])];
  const order = [...new Set([...first, ...KEYS])];
  return order
    .map((key) => ({ key, value: p.record[key] ?? 0 }))
    .filter((x) => x.value > 0)
    .map((x) => ({ ...x, text: statText(x.key, x.value) }));
}

export function statText(key, v) {
  const r = RECORD[key];
  const n = r.fmt ? r.fmt(v) : fmtNum(Math.round(v));
  return `${n} ${Math.round(v) === 1 && r.one ? r.one : r.label}`;
}

// The compact line for cards and the Staff table: the first `n` stats.
export const recordLine = (p, n = 2) => recordStats(p).slice(0, n).map((x) => x.text).join(' · ');

// staffId -> badge text for the leader of each stat with a badge, when the lead is clear:
// the value is positive and nobody ties it. One badge per person (the first stat they lead).
export function recordLeaders(staff) {
  const out = new Map();
  if ((staff?.length ?? 0) < 3 || !staff.some(hasRecord)) return out;
  for (const key of KEYS) {
    if (!RECORD[key].top) continue;
    const sorted = staff.map((p) => ({ p, v: p.record?.[key] ?? 0 })).sort((a, b) => b.v - a.v);
    const [a, b] = sorted;
    if (a.v > 0 && a.v > (b?.v ?? 0) && !out.has(a.p.id)) out.set(a.p.id, RECORD[key].top);
  }
  return out;
}
