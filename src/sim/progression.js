import { ensureRecord } from './record.js';
import { B } from './balance.js';
import { article } from './util.js';
import { registerAction } from './registry.js';
import { emitChat } from './chat.js';
import { PATHS } from '../data/paths.js';
import { TRAITS, EARNED_TRAITS } from '../data/traits.js';
import { ROLES } from '../data/roles.js';
import { lockedReason } from './unlocks.js';
import { purchaseProblem, findSpot, placeNow, upgradeProblem, upgradeNow, layoutOf } from './office.js';

// Why an item cannot be bought and placed automatically right now, or null. Used by events that buy things.
export function buyItemBlocker(state, itemId) {
  const reason = purchaseProblem(state, itemId);
  if (reason) return reason;
  return findSpot(layoutOf(state), state.office.placed, itemId) ? null : 'No room for it';
}

export const upgradeItemBlocker = upgradeProblem;

// The lowest-level placed copy of an item, the one worth upgrading.
export const ownedCopy = (state, itemId) => state.office.placed.filter((i) => i.itemId === itemId).sort((a, b) => a.level - b.level)[0] ?? null;

// Buys an item and puts it in the first free spot.
export const buyItemNow = (ctx, itemId) => placeNow(ctx, itemId, findSpot(layoutOf(ctx.state), ctx.state.office.placed, itemId));

export const upgradeItemNow = upgradeNow;

registerAction('choosePath', (ctx, { staffId, pathId }) => {
  const { state } = ctx;
  const p = state.staff.find((x) => x.id === staffId);
  if (!p) return { ok: false, reason: 'No such staff member' };
  const locked = lockedReason(state, 'paths');
  if (locked) return { ok: false, reason: locked };
  if (!p.pathPending) return { ok: false, reason: 'No path to choose yet' };
  const path = PATHS[pathId];
  if (!path) return { ok: false, reason: 'Unknown path' };
  if (path.role !== p.role) return { ok: false, reason: `That path is for ${ROLES[path.role].name.toLowerCase()}s` };
  p.path = pathId;
  p.pathPending = false;
  ctx.emit({ type: 'toast', text: `${p.name} is now ${article(path.name)}.`, tone: 'good' });
  ctx.emit({ type: 'celebrate', staffId: p.id });
  return { ok: true };
});

// Paths only become choosable once the paths system is open; opening it offers one to every senior.
export function onReachedSenior(ctx, p) {
  ctx.state.flags.firstSeniorWeek ??= ctx.state.week;
  if (lockedReason(ctx.state, 'paths')) return;
  p.pathPending = true;
  ctx.emit({ type: 'toast', text: `${p.name} is ready to choose a career path.`, tone: 'info' });
}

// Called when career paths unlock: every senior without a path, founders and candidates included, gets to pick.
export function offerPaths(state) {
  for (const p of [...state.staff, ...state.candidates]) if (p.seniority === 'senior' && !p.path) p.pathPending = true;
}

export function onLevelUp(ctx, p) {
  if (p.level < B.maxLevel || p.legend) return;
  p.legend = true;
  ctx.emit({ type: 'toast', text: `${p.name} is a Legend. People will tell stories.`, tone: 'good' });
  ctx.emit({ type: 'celebrate', staffId: p.id });
  emitChat(ctx, { channel: 'wins', from: '@hr-bot', text: `Please welcome our newest Legend: ${p.name}. Bow accordingly.` });
}

// Weekly record counters and the traits people earn from them.
export function progressRecords(ctx, p) {
  ensureRecord(p);
  if (p.mood !== 'away') {
    if (p.assignment.type === 'mentor') p.record.mentorWeeks++;
    if (p.assignment.type === 'hardProblem') p.record.hardProblemWeeks++;
  }
  for (const e of EARNED_TRAITS) {
    if (p.record[e.counter] < e.threshold || p.traits.includes(e.trait) || p.traits.length >= 3) continue;
    p.traits.push(e.trait);
    ctx.emit({ type: 'toast', text: `${p.name} earned the ${TRAITS[e.trait].name} trait.`, tone: 'good' });
  }
}
