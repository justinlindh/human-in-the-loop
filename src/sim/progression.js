import { B } from './balance.js';
import { newId, article } from './util.js';
import { registerAction } from './registry.js';
import { emitChat } from './chat.js';
import { ITEMS } from '../data/items.js';
import { PATHS } from '../data/paths.js';
import { TRAITS, EARNED_TRAITS } from '../data/traits.js';
import { OFFICE_STAGES } from '../data/office.js';
import { ROLES } from '../data/roles.js';

const ownedItem = (state, id) => state.items.find((i) => i.id === id);

// Why an item cannot be bought right now, or null if it can.
export function buyItemBlocker(state, itemId) {
  const it = ITEMS[itemId];
  if (!it) return 'Unknown item';
  if (state.items.filter((i) => i.itemId === itemId).length >= 2) return 'You already have two';
  if (state.officeStage < it.minStage) return 'Needs a bigger office';
  if (it.requires === 'award' && state.stats.awards < 1) return 'Needs an award first';
  if (state.items.length >= OFFICE_STAGES[state.officeStage].itemSlots) return 'No free item slots';
  if (state.cash < it.costs[0]) return 'Not enough cash';
  return null;
}

// Why an owned item cannot be upgraded right now, or null if it can.
export function upgradeItemBlocker(state, owned) {
  if (!owned) return 'No such item';
  if (owned.level >= 3) return 'Already max level';
  if (state.cash < ITEMS[owned.itemId].costs[owned.level]) return 'Not enough cash';
  return null;
}

// The lowest-level owned copy of an item, the one worth upgrading.
export const ownedCopy = (state, itemId) => state.items.filter((i) => i.itemId === itemId).sort((a, b) => a.level - b.level)[0] ?? null;

registerAction('buyItem', (ctx, { itemId }) => {
  const reason = buyItemBlocker(ctx.state, itemId);
  return reason ? { ok: false, reason } : { ok: true, id: buyItemNow(ctx, itemId) };
});

export function buyItemNow(ctx, itemId) {
  const { state } = ctx;
  const it = ITEMS[itemId];
  state.cash -= it.costs[0];
  const id = newId(state, 'i');
  state.items.push({ id, itemId, level: 1 });
  state.flags.lastItemWeek = state.week;
  ctx.emit({ type: 'toast', text: `New in the office: ${it.name}.`, tone: 'good' });
  emitChat(ctx, { channel: 'random', from: '@officebot', text: `The new ${it.name} has arrived. Please be nice to it.` });
  return id;
}

export function upgradeItemNow(ctx, owned) {
  const it = ITEMS[owned.itemId];
  ctx.state.cash -= it.costs[owned.level];
  owned.level++;
  ctx.emit({ type: 'toast', text: `${it.name} upgraded to level ${owned.level}.`, tone: 'good' });
}

registerAction('upgradeItem', (ctx, { id }) => {
  const owned = ownedItem(ctx.state, id);
  const reason = upgradeItemBlocker(ctx.state, owned);
  if (reason) return { ok: false, reason };
  upgradeItemNow(ctx, owned);
  return { ok: true };
});

registerAction('sellItem', (ctx, { id }) => {
  const { state } = ctx;
  const owned = ownedItem(state, id);
  if (!owned) return { ok: false, reason: 'No such item' };
  const it = ITEMS[owned.itemId];
  const spent = it.costs.slice(0, owned.level).reduce((a, b) => a + b, 0);
  state.cash += spent / 2;
  state.items = state.items.filter((i) => i.id !== id);
  ctx.emit({ type: 'toast', text: `Sold the ${it.name} for $${(spent / 2).toLocaleString('en-US')}.`, tone: 'info' });
  return { ok: true };
});

registerAction('choosePath', (ctx, { staffId, pathId }) => {
  const { state } = ctx;
  const p = state.staff.find((x) => x.id === staffId);
  if (!p) return { ok: false, reason: 'No such staff member' };
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

export function onReachedSenior(ctx, p) {
  p.pathPending = true;
  ctx.emit({ type: 'toast', text: `${p.name} is ready to choose a career path.`, tone: 'info' });
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
  p.record ??= { mentorWeeks: 0, catches: 0, hardProblemWeeks: 0 };
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
