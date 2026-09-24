import { B } from './balance.js';
import { int, range, pick, shuffle, weighted } from './rng.js';
import { clamp, round, newId } from './util.js';
import { ROLES } from '../data/roles.js';
import { TRAITS } from '../data/traits.js';
import { FIRST_NAMES, LAST_NAMES } from '../data/names.js';

export const STATS = ['features', 'polish', 'reliability', 'novelty'];
export const SENIORITIES = ['junior', 'mid', 'senior'];

const SHIRTS = ['#4f8cff', '#ff7eb6', '#ffb020', '#34c38f', '#e5484d', '#9b6bff', '#f2efe6', '#2f3a4a', '#7fc8c0', '#d98c5f'];
const HAIR = ['#2b1d16', '#4a3222', '#7a4b2a', '#c68b4e', '#e8c170', '#b8b8b8', '#1c1c24', '#a3442f'];
const PANTS = ['#2e3440', '#4b5563', '#6b4f3a', '#1f3b5c', '#8a7f6a', '#3b3b46'];
const ACCESSORIES = ['none', 'none', 'none', 'glasses', 'headphones', 'beanie', 'cap'];

const SKILL_RANGE = { junior: [15, 35], mid: [35, 60], senior: [60, 85] };
const LEVEL_RANGE = { junior: [1, 2], mid: [5, 7], senior: [10, 13] };

export function topStats(role) {
  const w = B.roleWeights[role];
  return [...STATS].sort((a, b) => w[b] - w[a]).slice(0, 2);
}

const DEFAULT_MODS = {
  output: 1, meaningDrain: 1, meaningRecovery: 1, mentorBonus: 1, xp: 1, hype: 1, oversight: 1, stamina: 1,
  features: 1, polish: 1, reliability: 1, novelty: 1, resign: 1, salary: 1, catch: 0,
};

export function staffMods(person) {
  const m = { ...DEFAULT_MODS };
  for (const id of person.traits) {
    const t = TRAITS[id];
    if (!t) continue;
    for (const [k, v] of Object.entries(t.mods)) m[k] = k === 'catch' ? m[k] + v : m[k] * v;
  }
  return m;
}

export function generateStaff(state, { role, seniority }) {
  const r = state.rng;
  const top = topStats(role);
  const [lo, hi] = SKILL_RANGE[seniority];
  const skills = {};
  for (const st of STATS) {
    const base = int(r, lo, hi) * (top.includes(st) ? 1.3 : 1);
    skills[st] = Math.round(clamp(base, 1, 100));
  }
  const traits = shuffle(r, Object.keys(TRAITS)).slice(0, int(r, 0, 2));
  const person = {
    id: newId(state, 's'),
    name: `${pick(r, FIRST_NAMES)} ${pick(r, LAST_NAMES)}`,
    role, seniority,
    level: int(r, ...LEVEL_RANGE[seniority]), xp: 0,
    skills, speed: round(range(r, 0.8, 1.2), 2),
    meaning: int(r, 70, 90), stamina: 100, knowledge: B.newHireKnowledge, traits,
    assignment: { type: ROLES[role].defaultAssignment, targetId: null },
    mood: 'ok', burnoutWeeks: 0, sabbaticalWeeksLeft: 0,
    salary: 0, hiredWeek: state.week, founder: false,
    appearance: {
      skin: int(r, 0, 5), hair: int(r, 0, 7), hairColor: pick(r, HAIR), shirt: pick(r, SHIRTS),
      pants: pick(r, PANTS), accessory: pick(r, ACCESSORIES), build: int(r, 0, 2),
    },
  };
  person.salary = Math.round((B.salary[seniority] * staffMods(person).salary * range(r, 0.9, 1.1)) / 10) * 10;
  return person;
}

const SENIORITY_WEIGHTS = { senior: 20, mid: 40, junior: 40 };
const ROLE_WEIGHTS = { engineer: 35, designer: 13, marketer: 13, support: 13, security: 13, sales: 13 };

export function refreshCandidates(state) {
  state.candidates = [];
  for (let i = 0; i < B.candidateCount; i++) {
    const seniority = weighted(state.rng, SENIORITIES, (s) => SENIORITY_WEIGHTS[s]);
    const role = weighted(state.rng, Object.keys(ROLES), (x) => ROLE_WEIGHTS[x]);
    state.candidates.push(makeCandidate(state, role, seniority));
  }
  state.candidatesWeek = state.week;
}

export function makeCandidate(state, role, seniority) {
  const c = generateStaff(state, { role, seniority });
  if (seniority === 'junior' && state.policies.apprenticeship) {
    for (const st of STATS) c.skills[st] = Math.min(100, c.skills[st] + 10);
  }
  return c;
}
