import { B } from './balance.js';
import { registerSystem } from './registry.js';
import { chance, pick } from './rng.js';
import { removeStaff, endMentorshipsOf } from './staff.js';
import { emitChat } from './chat.js';

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
  ctx.emit({ type: 'resign', staffId: p.id, name: p.name, fired: false, reason: 'moved_on' });
  ctx.emit({ type: 'toast', tone: 'info', text: `${p.name} ${pick(rng, REASONS)}` });
}

registerSystem('move-on', moveOnSystem, 52);
