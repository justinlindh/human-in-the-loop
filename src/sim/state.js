import { B } from './balance.js';
import { createRng } from './rng.js';
import { START_YEAR } from './util.js';
import { generateStaff, refreshCandidates } from './staff.js';
import { CATEGORIES } from '../data/categories.js';
import { ANGLES } from '../data/angles.js';
import { MODELS } from '../data/models.js';
import { INCUMBENTS } from '../data/incumbents.js';
import { TRENDS } from '../data/trends.js';
import { GOALS } from '../data/goals.js';
import { rollEraSchedule } from './eras.js';

export const FUNCTIONS = ['engineering', 'support', 'sales', 'marketing', 'qa', 'ops'];
export const SAVE_VERSION = 2;

export function createGame({ seed = 1, companyName = 'Loopworks' } = {}) {
  const state = {
    version: SAVE_VERSION, seed, rng: createRng(seed), companyName, week: 0, nextId: 1,
    cash: B.startCash, brand: B.startBrand, institutionalKnowledge: 60, comprehensionDebt: 0,
    officeStage: 0,
    staff: [], candidates: [], candidatesWeek: 0,
    projects: [], products: [],
    automation: Object.fromEntries(FUNCTIONS.map((fn) => [fn, { level: 0, model: 'chatgbt' }])),
    policies: {},
    campaigns: [],
    security: { auditBoost: 0, tooling: false },
    ops: { supportShortfall: 0, maintenanceShortfall: 0, maintenanceCapacity: 0, oversightRequired: 0, oversightProvided: 0 },
    market: {
      categories: Object.fromEntries(INCUMBENTS.map((i) => [i.category, { incumbentStrength: i.strength, clones: 0 }])),
      trend: 'steady', trendWeeksLeft: TRENDS.steady.weeks,
      unlockedCategories: Object.values(CATEGORIES).filter((c) => c.unlockYear <= START_YEAR).map((c) => c.id),
      unlockedAngles: Object.values(ANGLES).filter((a) => a.era === 'classic').map((a) => a.id),
    },
    models: Object.fromEntries(Object.values(MODELS).map((m) => [m.id, {
      version: 1, capability: m.capability, costMult: 1, available: false, deprecated: false,
    }])),
    era: { id: 'classic', since: 0 },
    eraSchedule: {},
    unlocks: {},
    goals: Object.fromEntries(GOALS.map((g) => [g.id, { done: false, week: null }])),
    items: [],
    research: { done: [] },
    modifiers: [],
    scheduled: [],
    chatLog: [],
    discoveredCombos: {},
    outage: null,
    incidentLog: [],
    lowCashWeeks: 0,
    pendingDecision: null,
    flags: {},
    stats: { hires: 0, juniorsHired: 0, resignations: 0, incidents: 0, caught: 0, breaches: 0, launches: 0, awards: 0, peakMrr: 0 },
    history: [],
    gameOver: null,
  };
  for (const [role, seniority] of [['engineer', 'senior'], ['designer', 'mid']]) {
    let p = generateStaff(state, { role, seniority });
    const taken = state.staff.map((f) => f.name.split(' ')[0]);
    while (taken.includes(p.name.split(' ')[0])) p = generateStaff(state, { role, seniority });
    Object.assign(p, { knowledge: 70, meaning: 85, founder: true, hiredWeek: 0, assignment: { type: 'idle', targetId: null } });
    state.staff.push(p);
  }
  // A side stream, so the era jitter does not shift every other roll in the run.
  state.eraSchedule = rollEraSchedule(createRng(seed * 7919 + 13), B.eraJitterWeeks);
  refreshCandidates(state);
  return state;
}
