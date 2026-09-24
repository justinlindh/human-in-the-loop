import { B } from './balance.js';
import { registerSystem } from './registry.js';
import { chance, pick } from './rng.js';
import { removeStaff, endMentorshipsOf, staffMods, makeCandidate } from './staff.js';
import { avg } from './util.js';
import { emitChat } from './chat.js';
import { itemBonus } from './bonus.js';
import { purposeLift } from './purpose.js';
import { incumbentFor } from '../data/incumbents.js';

// Why a long-tenured person moves on for reasons that have nothing to do with the company.
const REASONS = [
  'is moving to Lisbon to "slow down". They have already joined three companies there.',
  'is going back to school to study something with no computers in it.',
  'is retiring to make pottery. Their first bowl is already better than the roadmap.',
  'is leaving to raise goats. The goats do not have standups.',
  'is following their partner to another time zone. They promise to lurk in #random.',
  'is taking a year to sail somewhere. The boat has no Wi-Fi, on purpose.',
  'is joining a friend\'s company. They apologised four times while telling you.',
  'is moving home to help with the family bakery. They will send bread.',
];

const FAREWELLS = [
  'Last day today. Thank you all. I am taking the good stapler.',
  'It has been a joy. The docs are in the wiki. Some of them are even true.',
  'Leaving the group chat would be too sad, so I am staying in it forever.',
  'Thank you for everything. Please water the plant by my desk. It knows things.',
  'Moving on, but not far. You know where to find me: #alumni.',
];

// Someone leaving a happy team sends a friend for their seat: a candidate with the same role and level.
function referFriend(ctx, p) {
  const { state } = ctx;
  if (!state.staff.length || avg(state.staff, (x) => x.meaning) < B.referralMeaning) return '';
  state.candidates.push(makeCandidate(state, p.role, p.seniority));
  state.candidates = state.candidates.slice(-B.candidateListMax);
  return ' They are sending a friend your way.';
}

// Now and then someone who has been around for years leaves on good terms. They join the alumni.
export function moveOnSystem(ctx) {
  const { state, rng } = ctx;
  if (state.staff.length < B.moveOnMinStaff) return;
  const eligible = state.staff.filter((p) => !p.founder && p.mood !== 'away' && state.week - p.hiredWeek >= B.moveOnTenureWeeks);
  const p = eligible.find(() => chance(rng, B.moveOnPerYear / 52));
  if (!p) return;
  emitChat(ctx, { person: p, text: pick(rng, FAREWELLS) });
  endMentorshipsOf(state, p);
  removeStaff(state, p);
  const friend = referFriend(ctx, p);
  ctx.emit({ type: 'resign', staffId: p.id, name: p.name, fired: false, reason: 'moved_on' });
  ctx.emit({ type: 'toast', tone: 'good', text: `${p.name} ${pick(rng, REASONS)}${friend}` });
}

// Why someone takes an offer. {who} is the company that hired them.
const OFFERS = [
  'got an offer from {who} they could not refuse. They tried. For about an hour.',
  'is joining {who}. The title has the word "Staff" in it twice.',
  'took a job at {who}. The signing bonus has its own signing bonus.',
  'is off to {who}. They say it is "for the equity". Their face says it is for the snacks.',
  'accepted an offer from {who} and apologised to the whole team in person, one at a time.',
];

const GOODBYES = [
  'Friday is my last day. This was the best place I have worked. Please do not tell {who}.',
  'I am leaving, but I am keeping the hoodie. That is non-negotiable.',
  'It was a hard call. The offer was very large and I am very weak.',
  'Thank you all. If anyone needs me I will be in a very nice office being slightly bored.',
];

const GOOD_POLICIES = ['sabbatical', 'apprenticeship', 'craft_fridays', 'no_crunch', 'blameless'];

// How much likelier than the base rate this person is to take an outside offer this week.
export function attritionRisk(state, p) {
  let risk = 1;
  if (p.meaning < B.attritionMeaningBelow) risk *= 1 + (B.attritionMeaningBelow - p.meaning) / B.attritionMeaningSpan;
  if (p.mood === 'coasting' || p.mood === 'burnout') risk *= B.attritionUnhappy;
  const fair = B.salary[p.seniority] * staffMods(p).salary;
  if (p.salary < fair * B.attritionUnderpaidBelow) risk *= B.attritionUnderpaid;
  if (state.rival && (state.rival.status === 'rising' || state.rival.status === 'stalled')) risk *= B.attritionRival;
  const perks = itemBonus(state, 'meaningRecovery') + itemBonus(state, 'staminaRecovery') - itemBonus(state, 'burnoutResign');
  risk *= Math.max(B.attritionPerkFloor, 1 - B.attritionPerkRelief * perks);
  for (const id of GOOD_POLICIES) if (state.policies[id]) risk *= B.attritionGoodPolicy;
  if (state.policies.top_pay) risk *= B.topPayAttrition;
  if (state.policies.office_upkeep) risk *= B.upkeepAttrition;
  risk *= Math.max(0, 1 - B.purposeRetention * purposeLift(state));
  return risk;
}

// Natural attrition: independent of exhaustion, people now and then take an outside offer. Unhappy,
// underpaid, and rival-courted people take them more often; perks and good policies keep people around.
export function attritionSystem(ctx) {
  const { state, rng } = ctx;
  if (state.staff.length < B.attritionMinStaff) return;
  const p = state.staff.find((x) => !x.founder && x.mood !== 'away' && state.week - x.hiredWeek >= B.attritionAfterWeeks
    && chance(rng, (B.attritionPerYear / 52) * attritionRisk(state, x)));
  if (!p) return;
  const rival = state.rival && (state.rival.status === 'rising' || state.rival.status === 'stalled') && chance(rng, 0.5) ? state.rival.name : null;
  const who = rival ?? incumbentFor(pick(rng, state.market.unlockedCategories)).name;
  emitChat(ctx, { person: p, text: pick(rng, GOODBYES).replaceAll('{who}', who) });
  endMentorshipsOf(state, p);
  removeStaff(state, p);
  state.stats.resignations++;
  const friend = referFriend(ctx, p);
  ctx.emit({ type: 'resign', staffId: p.id, name: p.name, fired: false, reason: 'poached' });
  ctx.emit({ type: 'toast', tone: 'info', text: `${p.name} ${pick(rng, OFFERS).replaceAll('{who}', who)}${friend}` });
}

registerSystem('move-on', moveOnSystem, 52);
registerSystem('attrition', attritionSystem, 53);
