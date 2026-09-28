import { forgetCarry } from './record.js';
import { B } from './balance.js';
import { clamp, sum } from './util.js';
import { registerSystem } from './registry.js';
import { ROLES } from '../data/roles.js';
import { itemBonus, researchBonus } from './bonus.js';
import { staffMods } from './staff.js';
import { remoteLearning } from './ladder.js';
import { bumpDebt } from './debt.js';
import { responding } from './responders.js';

const LEARNING = new Set(['project', 'maintenance', 'oversight', 'hardProblem', 'security']);

// Called whenever someone leaves (fired, resigned, event). The person must already be removed from staff.
export function onDeparture(state, person) {
  // Everyone who leaves joins the alumni network.
  const alumni = (state.flags.alumni ??= []);
  // The alumni list keeps the most recent few; this counts everyone who ever left.
  state.flags.departures = (state.flags.departures ?? alumni.length) + 1;
  alumni.push({ name: person.name, role: person.role, week: state.week, record: { ...(person.record ?? {}) } });
  forgetCarry(state, person.id);
  for (const sq of state.squads ?? []) {
    sq.memberIds = sq.memberIds.filter((id) => id !== person.id);
    sq.crewIds = (sq.crewIds ?? []).filter((id) => id !== person.id);
    if (sq.leadId === person.id) sq.leadId = null;
  }
  for (const [name, id] of Object.entries(state.flags.owners ?? {})) if (id === person.id) state.flags[`${name}Gone`] = true;
  if (alumni.length > B.alumniKept) alumni.splice(0, alumni.length - B.alumniKept);
  bumpDebt(state, person.knowledge * B.debtFromDeparturePerKnowledge * Math.max(0, 1 + researchBonus(state, 'departureDebt')));
  for (const p of state.staff) {
    if (p.assignment.targetId === person.id && p.assignment.type === 'mentor') {
      p.assignment = { type: ROLES[p.role].defaultAssignment, targetId: null };
    }
  }
  for (const pr of state.products) if (pr.ownerId === person.id) pr.ownerId = null;
  // A dog goes home with its owner; the office cat stays, owned by nobody.
  for (const pet of state.pets ?? []) if (pet.ownerId === person.id) pet.ownerId = null;
  if (state.pets) state.pets = state.pets.filter((pet) => pet.ownerId || pet.species === 'cat');
}

export function institutionalKnowledge(state) {
  const live = state.products.filter((p) => !p.killed).length;
  // Engineers and security hold the systems in their heads; founders built them, whatever their role.
  const weight = (p) => (p.role === 'engineer' || p.role === 'security' ? 1 : p.founder ? B.founderIkWeight : 0);
  const held = sum(state.staff, (p) => weight(p) * (p.knowledge / 100) * B.seniorityOutput[p.seniority]);
  const standup = state.policies.daily_standups ? B.standupIkBonus : state.policies.async_standups ? B.standupIkBonus / 2 : 0;
  return clamp(((100 * held) / (B.ikBaseline + B.ikPerProduct * live)) * (1 + researchBonus(state, 'ik') + standup), 0, 100);
}

export function knowledgeSystem(ctx) {
  const { state } = ctx;
  const engLevel = state.automation.engineering.level;
  const mentees = new Set(state.staff.filter((p) => p.mood !== 'away' && p.assignment.type === 'mentor').map((p) => p.assignment.targetId));

  for (const p of state.staff) {
    if (p.mood === 'away') continue;
    const a = p.assignment.type;
    let gain = 0;
    if (LEARNING.has(a)) {
      const dulled = p.role === 'engineer' && a !== 'hardProblem';
      gain += B.knowledgeGainWorking * (dulled ? 1 - 0.7 * engLevel : 1);
    }
    if (p.seniority === 'junior' && mentees.has(p.id)) gain += B.knowledgeGainMentee * remoteLearning(state, p);
    p.knowledge = Math.min(100, p.knowledge + gain * staffMods(p).knowledgeGain * (1 + itemBonus(state, 'knowledgeGain')) * (p.remote ? B.remoteKnowledgeMult : 1));
  }

  state.institutionalKnowledge = institutionalKnowledge(state);

  const debt = state.comprehensionDebt;
  const flow = debtFlow(state);
  const before = state.flags.debtAfterKnowledge ?? debt;
  state.comprehensionDebt = clamp(debt + sum(Object.values(flow), (v) => v), 0, 100);
  state.debtFlow = { ...flow, oneOff: state.flags.debtOneOff ?? 0, net: state.comprehensionDebt - before };
  state.flags.debtOneOff = 0;
  state.flags.debtAfterKnowledge = state.comprehensionDebt;
}

// A paydown as a negative flow; zero stays +0 so the state survives a JSON round trip unchanged.
const paydown = (x) => (x > 0 ? -x : 0);

// Kinds of project that ship code people then have to understand.
const DEBT_WORK = new Set(['new', 'update', 'migration', 'research']);

// This week's comprehension debt change by source, before one-offs: inflows positive, paydowns negative.
export function debtFlow(state) {
  const debt = state.comprehensionDebt;
  const live = state.products.filter((p) => !p.killed).length;
  const { engineering, qa, ops } = state.automation;
  const ik = state.institutionalKnowledge;
  const here = state.staff.filter((p) => p.mood !== 'away');
  const shipping = new Set(state.projects.filter((j) => DEBT_WORK.has(j.kind)).map((j) => j.id));
  const builders = here.filter((p) => p.assignment.type === 'project' && shipping.has(p.assignment.targetId) && !responding(state, p.id));
  const engineers = here.filter((p) => p.role === 'engineer');
  const work = B.debtPerBuildWeek * sum(builders, (p) => B.debtBuildWeight[p.seniority] ?? 1) * (state.policies.crunch ? B.debtCrunchMult : 1);
  return {
    work,
    automation: B.debtFromEngAuto * engineering.level * (state.projects.length > 0 ? 1 : 0.5) + B.debtFromQaAuto * qa.level + B.debtFromOpsAuto * ops.level,
    products: B.debtPerProduct * live,
    lowKnowledge: ik < B.debtLowIkThreshold ? (B.debtLowIkThreshold - ik) * B.debtLowIkRate : 0,
    seniors: paydown(debt * B.debtPaydownPerSeniorEng * sum(engineers.filter((p) => p.seniority === 'senior'), (p) => (p.knowledge / 100) * staffMods(p).debtPaydown)),
    maintenance: paydown(debt * B.debtPaydownMaintenance * engineers.filter((p) => p.assignment.type === 'maintenance' && !responding(state, p.id)).length),
    reviews: state.policies.comprehension_reviews ? paydown(debt * B.debtPaydownReviews) : 0,
  };
}

registerSystem('knowledge', knowledgeSystem, 55);
