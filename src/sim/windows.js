import { B } from './balance.js';
import { createRng, int, pick } from './rng.js';
import { registerSystem } from './registry.js';
import { EVENTS } from '../data/events.js';
import { eventFitsEra, fireEvent, helpers, lastPauseWeek, resolveSubjects } from './events.js';

const WINDOW_EVENTS = Object.values(EVENTS).filter((e) => e.floorWindow);

// A fixed stream per event and game, so picking its week draws nothing from the game's rng.
const saltOf = (id) => [...id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const windowRng = (state, ev, n) => createRng((Math.imul(state.seed >>> 0, 2654435761) + saltOf(ev.id) + n) >>> 0);

// The week an event with a floorWindow is due: from..to weeks after the company first reached the Office Floor.
export function windowWeek(state, ev) {
  const { from, to } = ev.floorWindow;
  return state.flags.floorWeek + int(windowRng(state, ev, 0), from, to);
}

// Fires each floorWindow event once, on its due week or the first week after it that has room for a decision
// and fits the era, with the same era check random events get.
export function windowsSystem(ctx) {
  const { state } = ctx;
  if (state.officeStage < 1) return;
  state.flags.floorWeek ??= state.week;
  if (state.pendingDecision) return;
  const last = lastPauseWeek(state);
  if (last !== undefined && state.week - last < B.decisionGapWeeks) return;
  for (const ev of WINDOW_EVENTS) {
    if ((state.flags[`cd_${ev.id}`] ?? -1) > state.week || state.week < windowWeek(state, ev)) continue;
    if (!eventFitsEra(state, ev) || !ev.when(state, helpers(state))) continue;
    const subjects = resolveSubjects(state, ev);
    if (ev.subject !== null && !subjects.length) continue;
    if (fireEvent(ctx, ev, subjects.length ? pick(windowRng(state, ev, 1 + state.week), subjects).id : null)) return;
  }
}

registerSystem('windows', windowsSystem, 69);
