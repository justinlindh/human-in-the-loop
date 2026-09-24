import { B } from './balance.js';
import { int, range, pick, shuffle, weighted } from './rng.js';
import { clamp, round, newId } from './util.js';
import { ROLES } from '../data/roles.js';
import { TRAITS } from '../data/traits.js';
import { FIRST_NAMES, LAST_NAMES } from '../data/names.js';
import { OFFICE_STAGES } from '../data/office.js';
import { CHATTER } from '../data/chatter.js';
import { registerAction, registerSystem } from './registry.js';
import { onDeparture } from './knowledge.js';

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

const MOOD_MULT = { ok: 1, coasting: () => B.coastingOutput, burnout: () => B.burnoutOutput, away: 0 };

export function outputMult(state, person) {
  const m = MOOD_MULT[person.mood];
  const moodMult = typeof m === 'function' ? m() : (m ?? 1);
  const staminaMult = person.stamina < B.staminaLowBelow ? 0.7 : 1;
  const craft = state.policies.craft_fridays ? B.craftFridaysOutput : 1;
  return B.seniorityOutput[person.seniority] * person.speed * moodMult * staminaMult * staffMods(person).output * craft;
}

export const capacity = (state) => OFFICE_STAGES[state.officeStage].capacity;

export const findStaff = (state, id) => state.staff.find((p) => p.id === id);

export const isWorking = (p) => p.mood !== 'away' && p.assignment.type !== 'idle' && p.assignment.type !== 'sabbatical';

export const mentorOf = (state, junior) => state.staff.find((p) => p.assignment.type === 'mentor' && p.assignment.targetId === junior.id && p.mood !== 'away');

export const defaultAssignment = (p) => ({ type: ROLES[p.role].defaultAssignment, targetId: null });

export const roleName = (role) => ROLES[role].name;

const ASSIGNMENT_TYPES = ['project', 'maintenance', 'oversight', 'mentor', 'hardProblem', 'support', 'sales', 'security', 'marketing', 'idle', 'sabbatical'];

// Removes a person from staff and runs departure bookkeeping.
export function removeStaff(state, person) {
  state.staff = state.staff.filter((p) => p.id !== person.id);
  onDeparture(state, person);
}

registerAction('hire', (ctx, { candidateId }) => {
  const { state } = ctx;
  const c = state.candidates.find((x) => x.id === candidateId);
  if (!c) return { ok: false, reason: 'No such candidate' };
  if (state.staff.length >= capacity(state)) return { ok: false, reason: 'Office is full' };
  const fee = c.salary * B.hireFeeWeeks;
  if (state.cash < fee) return { ok: false, reason: 'Not enough cash' };
  state.candidates = state.candidates.filter((x) => x.id !== c.id);
  c.hiredWeek = state.week;
  state.staff.push(c);
  state.cash -= fee;
  state.stats.hires++;
  if (c.seniority === 'junior') state.stats.juniorsHired++;
  ctx.emit({ type: 'hire', staffId: c.id });
  ctx.emit({ type: 'chat', from: c.name, text: pick(ctx.rng, CHATTER.hello) });
  return { ok: true };
});

registerAction('fire', (ctx, { staffId }) => {
  const { state } = ctx;
  const p = findStaff(state, staffId);
  if (!p) return { ok: false, reason: 'No such staff member' };
  if (p.founder) return { ok: false, reason: 'Founders cannot be fired' };
  removeStaff(state, p);
  ctx.emit({ type: 'toast', text: `${p.name} has left ${state.companyName}.`, tone: 'info' });
  return { ok: true };
});

function validateAssignment(state, p, a) {
  if (!a || !ASSIGNMENT_TYPES.includes(a.type)) return 'Unknown assignment';
  if (p.mood === 'away') return 'They are on sabbatical';
  switch (a.type) {
    case 'project':
      if (!state.projects.some((j) => j.id === a.targetId)) return 'No such project';
      break;
    case 'mentor': {
      if (p.seniority === 'junior') return 'Only mids and seniors can mentor';
      const t = findStaff(state, a.targetId);
      if (!t || t.id === p.id || t.seniority !== 'junior') return 'Mentors need a junior to mentor';
      break;
    }
    case 'hardProblem':
      if (p.seniority !== 'senior') return 'Hard problems need a senior';
      break;
    case 'sabbatical':
      if (!state.policies.sabbatical) return 'Needs the Sabbatical Program';
      break;
    default:
  }
  return null;
}

// Applies an assignment after validation; shared by the action and by events.
export function applyAssignment(state, p, a) {
  const needsTarget = a.type === 'project' || a.type === 'mentor';
  p.assignment = { type: a.type, targetId: needsTarget ? a.targetId : null };
  if (a.type === 'sabbatical') {
    p.mood = 'away';
    p.sabbaticalWeeksLeft = B.sabbaticalWeeks;
  }
}

export function tryAssign(state, p, a) {
  const reason = validateAssignment(state, p, a);
  if (reason) return reason;
  applyAssignment(state, p, a);
  return null;
}

registerAction('assign', (ctx, { staffId, assignment }) => {
  const p = findStaff(ctx.state, staffId);
  if (!p) return { ok: false, reason: 'No such staff member' };
  const reason = tryAssign(ctx.state, p, assignment);
  return reason ? { ok: false, reason } : { ok: true };
});

registerAction('train', (ctx, { staffId }) => {
  const { state } = ctx;
  const p = findStaff(state, staffId);
  if (!p) return { ok: false, reason: 'No such staff member' };
  if (state.cash < B.trainingCost) return { ok: false, reason: 'Not enough cash' };
  state.cash -= B.trainingCost;
  const gain = B.trainingXp * staffMods(p).xp;
  p.xp += gain;
  ctx.emit({ type: 'bubble', staffId: p.id, text: `+${Math.round(gain)} XP`, tone: 'good' });
  return { ok: true };
});

function levelUp(ctx, p) {
  const { state } = ctx;
  while (p.level < B.maxLevel && p.xp >= B.xpPerLevel * p.level) {
    p.xp -= B.xpPerLevel * p.level;
    p.level++;
    for (const st of topStats(p.role)) p.skills[st] = Math.min(100, p.skills[st] + int(ctx.rng, 2, 4));
  }
  if (p.level >= B.maxLevel) p.xp = Math.min(p.xp, B.xpPerLevel * p.level);
  const next = p.seniority === 'junior' && p.level >= B.promoteMidLevel ? 'mid'
    : p.seniority === 'mid' && p.level >= B.promoteSeniorLevel ? 'senior' : null;
  if (!next) return;
  p.seniority = next;
  p.salary = Math.round((B.salary[next] * staffMods(p).salary) / 10) * 10;
  for (const m of state.staff) {
    if (m.assignment.type === 'mentor' && m.assignment.targetId === p.id) m.assignment = defaultAssignment(m);
  }
  ctx.emit({ type: 'toast', text: `${p.name} is now a ${next === 'mid' ? 'Mid' : 'Senior'} ${roleName(p.role)}!`, tone: 'good' });
  ctx.emit({ type: 'celebrate', staffId: p.id });
}

export function staffUpkeep(ctx) {
  const { state } = ctx;
  const engLevel = state.automation.engineering.level;
  for (const p of state.staff) {
    const mods = staffMods(p);
    const working = isWorking(p);
    const mentor = p.seniority === 'junior' ? mentorOf(state, p) : null;
    if (working || mentor) {
      let gain = B.xpPerWeekWorking * mods.xp;
      if (p.seniority === 'junior') {
        gain *= mentor ? B.mentorXpMult * staffMods(mentor).mentorBonus : 1 - B.juniorXpAutomationPenalty * engLevel;
      }
      p.xp += gain;
      levelUp(ctx, p);
    }
    if (p.mood === 'away') p.stamina += B.staminaRecovery * 0.5;
    else if (working) p.stamina -= B.staminaDrainWorking * mods.stamina;
    else p.stamina += B.staminaRecovery * 2;
    p.stamina = clamp(p.stamina, 0, 100);
    if (p.mood === 'away' && p.sabbaticalWeeksLeft > 0) {
      p.sabbaticalWeeksLeft--;
      if (p.sabbaticalWeeksLeft === 0) {
        p.mood = 'ok';
        p.assignment = defaultAssignment(p);
        ctx.emit({ type: 'toast', text: `${p.name} is back from sabbatical, tanned and dangerous.`, tone: 'good' });
      }
    }
  }
  if (state.week - state.candidatesWeek >= B.candidateRefreshWeeks) refreshCandidates(state);
}

registerSystem('staff-upkeep', staffUpkeep, 85);
