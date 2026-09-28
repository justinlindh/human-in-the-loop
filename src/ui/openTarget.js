// Opens what a { panel, arg } target names: an advisor option or a Yak prompt option's `opens`.
// { panel: 'office', arg: itemId } starts placing that item; when it can't be placed (locked, no
// cash, no room) the Office panel opens on it and a toast says why.
import { CATALOG, isDesk } from './v2content.js';
import { firstFit } from './placement.js';
import { itemLock } from './panels/office.js';
import { enterDeskPlacement } from './panels/hire.js';

// Why itemId can't be placed right now, or null.
export function placeBlocker(s, itemId) {
  const it = CATALOG[itemId];
  if (!it) return 'Unknown item';
  if (!s.office?.placed) return 'This office has a fixed layout';
  const lock = itemLock(s, it);
  if (lock) return lock;
  if ((s.cash ?? 0) < (it.costs?.[0] ?? 0)) return 'Not enough cash';
  if (![0, 1].some((rot) => firstFit(s, itemId, rot))) return 'No room for that here';
  return null;
}

// Enters placement of itemId, or opens the Office panel on it with the reason. Returns true.
export function startPlacing(ctx, itemId) {
  const why = placeBlocker(ctx.getState(), itemId);
  if (why) {
    ctx.open('office', CATALOG[itemId] ? { focus: itemId } : undefined);
    ctx.toast(why, 'warn');
    ctx.sfx?.('error');
    return true;
  }
  if (isDesk(itemId)) enterDeskPlacement(ctx);
  else ctx.build.enter(itemId);
  return true;
}

const ARG_KEY = { staff: 'staffId', policies: 'policyId', reports: 'productId', marketing: 'productId', build: 'productId' };

export function openTarget(ctx, target) {
  const panel = target?.panel;
  if (!panel) return false;
  const arg = target.arg;
  if (panel === 'office' && typeof arg === 'string' && arg) return startPlacing(ctx, arg);
  ctx.open(panel, arg && ARG_KEY[panel] ? { [ARG_KEY[panel]]: arg } : undefined);
  return true;
}
