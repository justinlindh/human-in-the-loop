import { pacingOn } from './pacing.js';

// A whole new system: a menu appearing, or the Meaning reveal. Only these get a card without an era.
export const PIP_SYSTEMS = new Set(['meaning', 'marketing', 'ops', 'models', 'automation']);

// Splits a tick's unlock items ({ key, menuId, menuLabel }) into the ones that keep a card and the ones
// that get a New pip and one toast. An era card lists its own unlocks, so with one nothing is split.
export function splitUnlocks(items, era) {
  if (era || !pacingOn('unlockPips')) return { card: items, pip: [] };
  return { card: items.filter((it) => PIP_SYSTEMS.has(it.key)), pip: items.filter((it) => !PIP_SYSTEMS.has(it.key)) };
}

// The one toast for the pipped unlocks: { text, menuId } or null.
export function pipToast(pip, title) {
  if (!pip.length) return null;
  const first = pip[0];
  const text = pip.length === 1
    ? `New: ${title(first.key)}${first.menuLabel ? `, placed from ${first.menuLabel}.` : '.'}`
    : `${pip.length} new things unlocked. Look for the New pips.`;
  return { text, menuId: first.menuId };
}
