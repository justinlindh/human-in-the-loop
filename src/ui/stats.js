// Player-facing names for the four stat pairs. Products are rated on Features, Polish, Reliability,
// and Freshness; people's skills Building, Craft, Rigor, and Ideas drive them. A pair shares an
// icon and a colour everywhere. The keys are the sim's (freshness is stored as novelty).
import { h } from './dom.js';
import { icon } from './icons.js';

export const STATS = [
  { id: 'features', product: 'Features', skill: 'Building', color: '#4f8cff', icon: 'stat.features' },
  { id: 'polish', product: 'Polish', skill: 'Craft', color: '#ff7eb6', icon: 'stat.polish' },
  { id: 'reliability', product: 'Reliability', skill: 'Rigor', color: '#34c38f', icon: 'stat.reliability' },
  { id: 'novelty', product: 'Freshness', skill: 'Ideas', color: '#ffb020', icon: 'stat.novelty' },
];
export const STAT = Object.fromEntries(STATS.map((s) => [s.id, s]));

// The skills that matter most for each role, in order.
const ROLE_SKILLS = {
  engineer: ['features', 'reliability'], designer: ['polish', 'novelty'], marketer: ['novelty', 'polish'],
  support: ['reliability', 'polish'], security: ['reliability', 'features'], sales: ['features', 'novelty'],
};
export const roleSkills = (role) => ROLE_SKILLS[role] ?? ['features', 'polish'];

export function bestSkill(p) {
  const sk = p.skills ?? {};
  return STATS.reduce((best, s) => ((sk[s.id] ?? 0) > (sk[best.id] ?? 0) ? s : best), STATS[0]);
}

const tier = (v) => (v >= 80 ? 'Great at' : v >= 60 ? 'Strong at' : v >= 40 ? 'Decent at' : 'Learning');

// "Strong at Craft", with the skill's icon; tier words keep the chip readable without the number.
export function strengthChip(p) {
  const b = bestSkill(p);
  const v = p.skills?.[b.id] ?? 0;
  return h('span.pill.strength', { style: { '--sc': b.color }, title: `${b.skill} ${v}: drives ${b.product}` },
    icon(b.icon, { size: 13 }), ` ${tier(v)} ${b.skill}`);
}

// A compact labelled skill row: icon, name, bar, number.
export function skillRow(id, value, { product = false } = {}) {
  const s = STAT[id];
  return h('div.skrow', { title: product ? s.product : `${s.skill}: drives ${s.product}` },
    h('span.skname', null, icon(s.icon, { size: 13 }), ` ${product ? s.product : s.skill}`),
    h('div.bar', null, h('i', { style: { width: `${Math.max(0, Math.min(100, value))}%`, background: s.color } })),
    h('b.num', { text: String(Math.round(value)) }));
}
