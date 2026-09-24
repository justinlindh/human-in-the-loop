// localStorage persistence for the sim state. storage defaults to globalThis.localStorage;
// tests pass any object with getItem/setItem/removeItem.
import { SAVE_VERSION } from '../sim/state.js';
import { EVENTS } from '../data/events.js';

export const SAVE_KEY = 'hitl.save.v1';

const REQUIRED_KEYS = [
  'version', 'seed', 'rng', 'companyName', 'week', 'nextId', 'cash', 'brand', 'institutionalKnowledge', 'comprehensionDebt',
  'officeStage', 'staff', 'candidates', 'candidatesWeek', 'projects', 'products', 'automation', 'policies', 'campaigns',
  'security', 'ops', 'market', 'models', 'discoveredCombos', 'outage', 'incidentLog', 'lowCashWeeks', 'pendingDecision',
  'flags', 'stats', 'history', 'gameOver',
];

const STATE_DEFAULTS = () => ({ items: [], research: { done: [] }, modifiers: [], scheduled: [] });
const STAFF_DEFAULTS = () => ({ path: null, pathPending: false, legend: false, record: { mentorWeeks: 0, catches: 0, hardProblemWeeks: 0 } });

const store = (storage) => storage ?? globalThis.localStorage;

export function saveGame(state, storage) {
  try {
    store(storage).setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function hasSave(storage) {
  try {
    return store(storage).getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function clearSave(storage) {
  try {
    store(storage).removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

// Fills fields added after a save was written, so older saves of the same version keep loading.
function normalize(state) {
  for (const [k, v] of Object.entries(STATE_DEFAULTS())) if (!(k in state)) state[k] = v;
  for (const list of [state.staff, state.candidates]) {
    for (const p of list) for (const [k, v] of Object.entries(STAFF_DEFAULTS())) if (!(k in p)) p[k] = v;
  }
  for (const j of state.projects) if (!('researchId' in j)) j.researchId = null;
  return state;
}

export function loadGame(storage) {
  let raw;
  try {
    raw = store(storage).getItem(SAVE_KEY);
  } catch {
    return { ok: false, reason: 'No save found' };
  }
  if (raw === null || raw === undefined) return { ok: false, reason: 'No save found' };
  let state;
  try {
    state = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'Save is corrupted' };
  }
  if (!state || typeof state !== 'object' || Array.isArray(state)) return { ok: false, reason: 'Save is corrupted' };
  if ('version' in state && state.version !== SAVE_VERSION) return { ok: false, reason: 'Save is from an incompatible version' };
  if (REQUIRED_KEYS.some((k) => !(k in state)) || !Array.isArray(state.staff) || !Array.isArray(state.products)) {
    return { ok: false, reason: 'Save is corrupted' };
  }
  normalize(state);
  if (state.pendingDecision && !EVENTS[state.pendingDecision.eventId]) {
    state.pendingDecision = null;
    return { ok: true, state, notice: 'A decision from this save no longer exists and was skipped.' };
  }
  return { ok: true, state };
}
