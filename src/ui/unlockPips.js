import { pacingOn } from './pacing.js';

// A whole new system: a menu appearing, the Meaning reveal, the first Research, Ops or Standups (Standups
// also brings in the Policies menu). Only these get a card without an era.
export const PIP_SYSTEMS = new Set(['meaning', 'marketing', 'ops', 'models', 'automation', 'research', 'standups']);

// Splits a tick's unlock items ({ key, menuId, menuLabel }) into the ones that keep a card and the ones
// that get a New pip and one toast. An era card lists its own unlocks, so with one nothing is split.
export function splitUnlocks(items, era) {
  if (era || !pacingOn('unlockPips')) return { card: items, pip: [] };
  return { card: items.filter((it) => PIP_SYSTEMS.has(it.key)), pip: items.filter((it) => !PIP_SYSTEMS.has(it.key)) };
}

// New office items to place, under unlockPips: the toast text for their names, or null for none.
export function officePipText(names) {
  if (!names.length) return null;
  return names.length === 1 ? `New in the Office: ${names[0]}. Look for the New pip.` : `${names.length} new things to place in the Office. Look for the New pip.`;
}

// The one toast for the pipped unlocks: { text, menuId } or null.
export function pipToast(pip, title) {
  if (!pip.length) return null;
  const first = pip[0];
  const text = pip.length === 1
    ? `New: ${title(first.key)}${first.menuLabel ? `. It's in ${first.menuLabel}.` : '.'}`
    : `${pip.length} new things unlocked. Look for the New pips.`;
  return { text, menuId: first.menuId };
}
