// localStorage persistence for the sim state. storage defaults to globalThis.localStorage;
// tests pass any object with getItem/setItem/removeItem.
import { SAVE_VERSION } from '../sim/state.js';
import { dateOf } from '../sim/util.js';
import { EVENTS } from '../data/events.js';
import { MODELS } from '../data/models.js';
import { INCUMBENTS } from '../data/incumbents.js';
import { GOALS } from '../data/goals.js';
import { assignSeats } from '../sim/office.js';
import { voiceFor } from '../sim/staff.js';
import { tick } from '../sim/tick.js';

export const SAVE_KEY = 'hitl.save.v1';

const REQUIRED_KEYS = [
  'version', 'seed', 'rng', 'companyName', 'week', 'nextId', 'cash', 'brand', 'institutionalKnowledge', 'comprehensionDebt',
  'officeStage', 'staff', 'candidates', 'candidatesWeek', 'projects', 'products', 'automation', 'policies', 'campaigns',
  'security', 'ops', 'market', 'models', 'discoveredCombos', 'outage', 'incidentLog', 'lowCashWeeks', 'pendingDecision',
  'flags', 'stats', 'history', 'gameOver', 'era', 'eraSchedule', 'unlocks', 'goals', 'office', 'founding',
];

const STATE_DEFAULTS = () => ({ research: { done: [] }, modifiers: [], scheduled: [], chatLog: [], lockdown: null, workPolicy: null, pets: [], rival: null, purpose: null });
const STAFF_DEFAULTS = () => ({ path: null, pathPending: false, legend: false, record: { mentorWeeks: 0, catches: 0, hardProblemWeeks: 0 }, remote: false, call: null, strain: 0 });

const store = (storage) => storage ?? globalThis.localStorage;

// Save slots: each company saves to its own slot (its id lives in state.flags.saveSlot). An index keeps
// the slots' metadata for the title screen and remembers the last slot written. SAVE_KEY is the single
// save older builds wrote; it still loads when there are no slots.
export const INDEX_KEY = 'hitl.saves.v2';
export const MAX_SLOTS = 6;
const slotKey = (id) => `hitl.save.v2.${id}`;

function readIndex(storage) {
  try {
    const idx = JSON.parse(store(storage).getItem(INDEX_KEY) ?? 'null');
    return idx && typeof idx === 'object' && idx.slots && typeof idx.slots === 'object' ? idx : { last: null, slots: {} };
  } catch {
    return { last: null, slots: {} };
  }
}

const writeIndex = (storage, idx) => store(storage).setItem(INDEX_KEY, JSON.stringify(idx));

// What the title screen shows for a save.
export function saveMeta(state, id) {
  return {
    id, companyName: state.companyName, logoColor: state.founding?.logoColor ?? null, week: state.week,
    year: dateOf(state.week).year, eraId: state.era?.id ?? 'classic', over: !!state.gameOver, savedAt: Date.now(), version: state.version,
  };
}

// A free slot id, or the oldest slot when all are taken.
function allocate(idx) {
  for (let i = 1; i <= MAX_SLOTS; i++) if (!idx.slots[`s${i}`]) return `s${i}`;
  return Object.values(idx.slots).sort((a, b) => a.savedAt - b.savedAt)[0].id;
}

export function saveGame(state, storage, id = state.flags?.saveSlot) {
  try {
    const idx = readIndex(storage);
    const slot = id ?? allocate(idx);
    if (state.flags) state.flags.saveSlot = slot;
    store(storage).setItem(slotKey(slot), JSON.stringify(state));
    idx.slots[slot] = saveMeta(state, slot);
    idx.last = slot;
    writeIndex(storage, idx);
    return true;
  } catch {
    return false;
  }
}

// Every save slot's metadata, most recently saved first.
export function listSaves(storage) {
  return Object.values(readIndex(storage).slots).sort((a, b) => b.savedAt - a.savedAt);
}

export function hasSave(storage) {
  try {
    return listSaves(storage).length > 0 || store(storage).getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function deleteSave(storage, id) {
  try {
    const idx = readIndex(storage);
    store(storage).removeItem(slotKey(id));
    delete idx.slots[id];
    if (idx.last === id) idx.last = listSaves(storage).find((m) => m.id !== id)?.id ?? null;
    writeIndex(storage, idx);
  } catch {
    // Nothing to delete if storage is unavailable.
  }
}

// Removes a slot (by default the last one written) and the old single save.
export function clearSave(storage, id = readIndex(storage).last) {
  try {
    if (id) deleteSave(storage, id);
    store(storage).removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const arrayOfObjects = (v) => Array.isArray(v) && v.every(isObj);

function wellFormed(state) {
  const lists = ['staff', 'candidates', 'projects', 'products', 'campaigns', 'incidentLog', 'history'];
  if (!lists.every((k) => arrayOfObjects(state[k]))) return false;
  if (!isObj(state.office) || !arrayOfObjects(state.office.placed)) return false;
  if (['modifiers', 'scheduled', 'chatLog'].some((k) => k in state && !arrayOfObjects(state[k]))) return false;
  if (![...state.staff, ...state.candidates].every((p) => isObj(p.assignment) && isObj(p.skills) && Array.isArray(p.traits))) return false;
  return ['rng', 'automation', 'market', 'models', 'stats', 'flags', 'ops', 'security', 'policies', 'era', 'eraSchedule', 'unlocks', 'goals'].every((k) => isObj(state[k]));
}

// Fills fields added after a save was written, so older saves of the same version keep loading.
function normalize(state) {
  for (const [k, v] of Object.entries(STATE_DEFAULTS())) if (!(k in state)) state[k] = v;
  for (const list of [state.staff, state.candidates]) {
    for (const p of list) for (const [k, v] of Object.entries(STAFF_DEFAULTS())) if (!(k in p)) p[k] = v;
    for (const p of list) p.voice ??= voiceFor(p);
  }
  for (const j of state.projects) if (!('researchId' in j)) j.researchId = null;
  // Per-id maps gain an entry for every id the data knows, so lookups by id never miss.
  for (const m of Object.values(MODELS)) {
    state.models[m.id] ??= { version: 1, capability: m.capability, costMult: 1, available: false, deprecated: false };
  }
  for (const i of INCUMBENTS) state.market.categories[i.category] ??= { incumbentStrength: i.strength, clones: 0 };
  for (const g of GOALS) state.goals[g.id] ??= { done: false, week: null };
  // Saves from before sticky seats: seat everyone in staff order.
  if (state.staff.some((p) => !('deskId' in p))) {
    for (const p of state.staff) p.deskId = null;
    assignSeats(state);
  }
  return state;
}

function readRaw(storage, id) {
  try {
    return store(storage).getItem(id ? slotKey(id) : SAVE_KEY);
  } catch {
    return null;
  }
}

// The raw text of a slot (by default the last one written), even one that no longer loads, for export.
export function exportSave(storage, id = readIndex(storage).last) {
  return readRaw(storage, id);
}

// A trial week on a copy: a save written by an older build of the same version can still hold state this
// build cannot run.
function runs(raw) {
  try {
    const copy = normalize(JSON.parse(raw));
    copy.pendingDecision = null;
    copy.gameOver = null;
    tick(copy);
    return true;
  } catch {
    return false;
  }
}

// Loads a slot (by default the last one written, else the old single save). A successful result carries id.
// A save from another build fails with stale: true (and its version); the slot is kept, so exportSave still
// reads it.
export function loadGame(storage, id = readIndex(storage).last) {
  const raw = readRaw(storage, id);
  if (raw === null || raw === undefined) return { ok: false, reason: 'No save found' };
  let state;
  try {
    state = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'Save is corrupted' };
  }
  if (!state || typeof state !== 'object' || Array.isArray(state)) return { ok: false, reason: 'Save is corrupted' };
  if ('version' in state && state.version !== SAVE_VERSION) {
    const older = !(state.version > SAVE_VERSION);
    return { ok: false, reason: older ? 'Save is from an older build' : 'Save is from a newer build', stale: true, version: state.version };
  }
  if (REQUIRED_KEYS.some((k) => !(k in state)) || !wellFormed(state)) return { ok: false, reason: 'Save is corrupted' };
  try {
    normalize(state);
  } catch {
    return { ok: false, reason: 'Save is corrupted' };
  }
  if (!state.gameOver && !runs(raw)) return { ok: false, reason: 'Save is from an older build', stale: true, version: state.version, id: id ?? null };
  if (state.pendingDecision && !EVENTS[state.pendingDecision.eventId]) {
    state.pendingDecision = null;
    return { ok: true, id: id ?? null, state, notice: 'A decision from this save no longer exists and was skipped.' };
  }
  return { ok: true, id: id ?? null, state };
}
