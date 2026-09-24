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
import { emitChat } from './chat.js';
import { modifierBonus } from './modifiers.js';
import { itemBonus, researchBonus } from './bonus.js';
import { onReachedSenior, onLevelUp, progressRecords } from './progression.js';
import { PATHS, ADDITIVE_PATH_KEYS } from '../data/paths.js';
import { TRAINING } from '../data/training.js';

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
  return [...STATS].filter((st) => w[st] > 0).sort((a, b) => w[b] - w[a]).slice(0, 2);
}

const DEFAULT_MODS = {
  output: 1, meaningDrain: 1, meaningRecovery: 1, mentorBonus: 1, xp: 1, hype: 1, oversight: 1, stamina: 1,
  features: 1, polish: 1, reliability: 1, novelty: 1, resign: 1, salary: 1, catch: 0,
  debtPaydown: 1, knowledgeGain: 1, oversightMeaning: 1, hardProblemNovelty: 1, brandGain: 1, supportHours: 1,
  churn: 1, outageFix: 1, salesBoost: 1, acquisition: 1, brandPerWeek: 0, postureFlat: 0,
};

const LEGEND_BOOST = 1.25;

// Trait mods and career-path mods merged. A Legend's path perk is 25% further from neutral.
export function staffMods(person) {
  const m = { ...DEFAULT_MODS };
  for (const id of person.traits) {
    const t = TRAITS[id];
    if (!t) continue;
    for (const [k, v] of Object.entries(t.mods)) m[k] = k === 'catch' ? m[k] + v : m[k] * v;
  }
  const path = person.path ? PATHS[person.path] : null;
  if (path) {
    const boost = person.legend ? LEGEND_BOOST : 1;
    for (const [k, v] of Object.entries(path.mods)) {
      if (ADDITIVE_PATH_KEYS.includes(k)) m[k] += v * boost;
      else m[k] *= 1 + (v - 1) * boost;
    }
  }
  return m;
}

const RANDOM_TRAITS = Object.keys(TRAITS).filter((id) => id !== 'natural_mentor');

export function generateStaff(state, { role, seniority }) {
  const r = state.rng;
  const top = topStats(role);
  const [lo, hi] = SKILL_RANGE[seniority];
  const skills = {};
  // The talent pool improves over the years as people grow up with the tools.
  const growth = B.candidateSkillPerYear * Math.floor(state.week / 52);
  for (const st of STATS) {
    const base = (int(r, lo, hi) + growth) * (top.includes(st) ? 1.3 : 1);
    skills[st] = Math.round(clamp(base, 1, 100));
  }
  const traits = shuffle(r, RANDOM_TRAITS).slice(0, int(r, 0, 2));
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
    path: null, pathPending: seniority === 'senior', legend: false, record: { mentorWeeks: 0, catches: 0, hardProblemWeeks: 0 },
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
  return B.seniorityOutput[person.seniority] * person.speed * moodMult * staminaMult * staffMods(person).output * craft
    * Math.max(0, 1 + modifierBonus(state, 'output') + itemBonus(state, 'output'));
}

export const capacity = (state) => OFFICE_STAGES[state.officeStage].capacity;

export const findStaff = (state, id) => state.staff.find((p) => p.id === id);

export const isWorking = (p) => p.mood !== 'away' && p.assignment.type !== 'idle' && p.assignment.type !== 'sabbatical';

export const mentorOf = (state, junior) => state.staff.find((p) => p.assignment.type === 'mentor' && p.assignment.targetId === junior.id && p.mood !== 'away');

export const defaultAssignment = (p) => ({ type: ROLES[p.role].defaultAssignment, targetId: null });

export const roleName = (role) => ROLES[role].name;

const ASSIGNMENT_TYPES = ['project', 'maintenance', 'oversight', 'mentor', 'hardProblem', 'support', 'sales', 'security', 'marketing', 'idle', 'sabbatical'];

// Sends anyone mentoring this person back to their default assignment.
export function endMentorshipsOf(state, person) {
  for (const m of state.staff) {
    if (m.assignment.type === 'mentor' && m.assignment.targetId === person.id) m.assignment = defaultAssignment(m);
  }
}

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
  c.knowledge = Math.min(100, c.knowledge + researchBonus(state, 'newHireKnowledge'));
  state.staff.push(c);
  state.cash -= fee;
  state.stats.hires++;
  if (c.seniority === 'junior') state.stats.juniorsHired++;
  ctx.emit({ type: 'hire', staffId: c.id });
  emitChat(ctx, { person: c, text: pick(ctx.rng, CHATTER.hello) });
  return { ok: true };
});

registerAction('fire', (ctx, { staffId }) => {
  const { state } = ctx;
  const p = findStaff(state, staffId);
  if (!p) return { ok: false, reason: 'No such staff member' };
  if (p.founder) return { ok: false, reason: 'Founders cannot be fired' };
  removeStaff(state, p);
  ctx.emit({ type: 'resign', staffId: p.id, name: p.name, fired: true });
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
      if (state.staff.some((m) => m.id !== p.id && m.assignment.type === 'mentor' && m.assignment.targetId === t.id)) return 'Already has a mentor';
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
    endMentorshipsOf(state, p);
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

registerAction('train', (ctx, { staffId, program, focus }) => {
  const { state } = ctx;
  const p = findStaff(state, staffId);
  if (!p) return { ok: false, reason: 'No such staff member' };
  const t = TRAINING[program];
  if (!t) return { ok: false, reason: 'Unknown program' };
  if (t.skill > 0 && !STATS.includes(focus)) return { ok: false, reason: 'Pick a skill to focus' };
  if (p.mood === 'away') return { ok: false, reason: 'They are away' };
  if (state.cash < t.cost) return { ok: false, reason: 'Not enough cash' };
  state.cash -= t.cost;
  const gain = t.xp * staffMods(p).xp;
  p.xp += gain;
  if (t.skill > 0) p.skills[focus] = Math.min(100, p.skills[focus] + t.skill);
  p.meaning = Math.min(100, p.meaning + t.meaning);
  p.knowledge = Math.min(100, p.knowledge + t.knowledge);
  state.brand = Math.min(100, state.brand + t.brand);
  if (t.awayWeeks > 0) {
    const before = p.assignment;
    p.mood = 'away';
    p.assignment = { type: 'sabbatical', targetId: null };
    p.sabbaticalWeeksLeft = t.awayWeeks;
    if (before.type === 'project') state.flags[`returnTo_${p.id}`] = before.targetId;
    endMentorshipsOf(state, p);
    state.flags[`awayFor_${p.id}`] = t.name;
  }
  ctx.emit({ type: 'bubble', staffId: p.id, text: `+${Math.round(gain)} XP`, tone: 'good' });
  ctx.emit({ type: 'toast', text: `${p.name} is off to a ${t.name.toLowerCase()}.`, tone: 'info' });
  return { ok: true };
});

function levelUp(ctx, p) {
  const { state } = ctx;
  while (p.level < B.maxLevel && p.xp >= B.xpPerLevel * p.level) {
    p.xp -= B.xpPerLevel * p.level;
    p.level++;
    for (const st of topStats(p.role)) p.skills[st] = Math.min(100, p.skills[st] + int(ctx.rng, 2, 4));
    onLevelUp(ctx, p);
  }
  if (p.level >= B.maxLevel) p.xp = Math.min(p.xp, B.xpPerLevel * p.level);
  const next = p.seniority === 'junior' && p.level >= B.promoteMidLevel ? 'mid'
    : p.seniority === 'mid' && p.level >= B.promoteSeniorLevel ? 'senior' : null;
  if (!next) return;
  p.seniority = next;
  p.salary = Math.round((B.salary[next] * staffMods(p).salary) / 10) * 10;
  endMentorshipsOf(state, p);
  (ctx.happenings ??= {}).promoted = [...(ctx.happenings.promoted ?? []), p.id];
  emitChat(ctx, { channel: 'wins', from: '@hr-bot', text: `Please congratulate ${p.name}, now a ${next === 'mid' ? 'Mid' : 'Senior'} ${roleName(p.role)}!`, kind: 'win' });
  ctx.emit({ type: 'toast', text: `${p.name} is now a ${next === 'mid' ? 'Mid' : 'Senior'} ${roleName(p.role)}!`, tone: 'good' });
  ctx.emit({ type: 'celebrate', staffId: p.id });
  if (next === 'senior') onReachedSenior(ctx, p);
}

export function staffUpkeep(ctx) {
  const { state } = ctx;
  const engLevel = state.automation.engineering.level;
  for (const p of state.staff) {
    const mods = staffMods(p);
    const working = isWorking(p);
    const mentor = p.seniority === 'junior' ? mentorOf(state, p) : null;
    if (working) {
      let gain = B.xpPerWeekWorking * mods.xp * Math.max(0, 1 + modifierBonus(state, 'xp'));
      if (p.seniority === 'junior') {
        gain *= mentor ? B.mentorXpMult * staffMods(mentor).mentorBonus : 1 - B.juniorXpAutomationPenalty * engLevel;
      }
      p.xp += gain;
      levelUp(ctx, p);
    }
    const recover = B.staminaRecovery * (1 + itemBonus(state, 'staminaRecovery'));
    if (p.mood === 'away') p.stamina += recover * 0.5;
    else if (working) p.stamina -= B.staminaDrainWorking * mods.stamina * Math.max(0, 1 + modifierBonus(state, 'staminaDrain') + itemBonus(state, 'staminaDrain'));
    else p.stamina += recover * 2;
    p.stamina = clamp(p.stamina, 0, 100);
    if (p.mood === 'away' && p.sabbaticalWeeksLeft > 0) {
      p.sabbaticalWeeksLeft--;
      if (p.sabbaticalWeeksLeft === 0) {
        p.mood = 'ok';
        const back = state.flags[`returnTo_${p.id}`];
        delete state.flags[`returnTo_${p.id}`];
        p.assignment = back && state.projects.some((j) => j.id === back) ? { type: 'project', targetId: back } : defaultAssignment(p);
        const from = state.flags[`awayFor_${p.id}`];
        delete state.flags[`awayFor_${p.id}`];
        ctx.emit({ type: 'toast', text: from ? `${p.name} is back from the ${from.toLowerCase()}, full of ideas.` : `${p.name} is back, rested and dangerous.`, tone: 'good' });
      }
    }
  }
  for (const p of state.staff) progressRecords(ctx, p);
  if (state.week % 52 === 51) for (const p of state.staff) p.salary = Math.round((p.salary * (1 + B.yearlyRaise)) / 10) * 10;
  if (state.week - state.candidatesWeek >= B.candidateRefreshWeeks) refreshCandidates(state);
}

registerSystem('staff-upkeep', staffUpkeep, 85);
