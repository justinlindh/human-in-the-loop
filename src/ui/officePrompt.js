// The next office, promoted once (#823): when a move becomes possible and stays possible for
// STABLE_WEEKS game weeks, a "Needs you" row names it with its price and the Office button gets a
// New pip. Both clear for good for that office once the player opens Office while the move is
// possible, or taps Later. They never open anything or pause the game. Whether a move is possible
// is the Office panel's own test: the sim's officeGateReason passes and the cash covers it.
import { SIMX } from './simapi.js';
import { OFFICE_STAGES } from '../data/office.js';
import { fmtMoney } from './dom.js';

const STABLE_WEEKS = 2;
const seenKey = (slot) => `hitl.office.promoted.${slot}`;

export function moveAvailable(s) {
  const next = OFFICE_STAGES[s?.officeStage + 1];
  if (!next) return null;
  let gate = '';
  try { gate = SIMX.officeGateReason ? SIMX.officeGateReason(s, next) : ''; } catch { gate = 'unknown'; }
  return !gate && s.cash >= next.upgradeCost ? next : null;
}

export function createOfficePrompt() {
  let since = null;     // the game week the current move first became possible
  let sinceStage = null;
  const seenMem = new Set();

  const read = (slot) => { try { const v = JSON.parse(localStorage.getItem(seenKey(slot)) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
  function isSeen(s) {
    if (seenMem.has(s.officeStage)) return true;
    const slot = s.flags?.saveSlot;
    return !!slot && read(slot).includes(s.officeStage);
  }
  function markSeen(s) {
    seenMem.add(s.officeStage);
    const slot = s.flags?.saveSlot;
    if (!slot) return;
    const list = read(slot);
    if (!list.includes(s.officeStage)) list.push(s.officeStage);
    try { localStorage.setItem(seenKey(slot), JSON.stringify(list)); } catch { /* private mode or blocked storage */ }
  }

  // The move to promote now, or null.
  function current(s) {
    const next = moveAvailable(s);
    if (!next || sinceStage !== s.officeStage) { since = next ? s.week : null; sinceStage = s.officeStage; }
    if (!next || s.week - since < STABLE_WEEKS || isSeen(s)) return null;
    return next;
  }

  return {
    current,
    // The Needs you row, for the HUD.
    rows(s) {
      const next = current(s);
      if (!next) return [];
      return [{
        key: `office-move-${s.officeStage}`, icon: 'office', text: `${next.name} is within reach · ${fmtMoney(next.upgradeCost)}`,
        go: ['office'], later: { label: 'Later', run: () => markSeen(s) },
      }];
    },
    // The player opened Office: a possible move counts as seen.
    opened(s) { if (moveAvailable(s)) markSeen(s); },
    reset() { since = null; sinceStage = null; seenMem.clear(); },
  };
}
