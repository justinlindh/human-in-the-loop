import { B } from './balance.js';
import { calendarDate } from './util.js';
import { eraAtLeast } from './eras.js';
import { ERA_STARTS, startEraId } from '../data/era-modes.js';
import { CATEGORIES } from '../data/categories.js';
import { ANGLES } from '../data/angles.js';
import { MODELS } from '../data/models.js';

// Apply the kit before generating people or placing their desks. No ticks, rewards or arrival events.
export function applyEraStart(state, requested) {
  const id = startEraId(requested);
  if (id === 'classic') return;
  const kit = B.eraStarts[id];
  const data = ERA_STARTS[id];
  const offset = state.eraSchedule[id];
  Object.assign(state.founding, { startEra: id, calendarOffset: offset, eraScoreMult: kit.scoreMult });
  state.era = { id, since: 0 };
  for (const era of Object.keys(state.eraSchedule)) state.eraSchedule[era] = Math.max(0, state.eraSchedule[era] - offset);
  state.cash += kit.cash;
  state.officeStage = state.office.stage = kit.officeStage;
  for (const key of data.unlocks) state.unlocks[key] = 0;
  for (const goal of data.skippedGoals) state.goals[goal].skipped = true;
  const { year } = calendarDate(state);
  state.market.unlockedCategories = Object.values(CATEGORIES).filter((c) => c.unlockYear <= year).map((c) => c.id);
  state.market.unlockedAngles = Object.values(ANGLES).filter((a) => eraAtLeast(state, a.era)).map((a) => a.id);
  for (const m of Object.values(MODELS)) state.models[m.id].available = m.releaseYear <= year;
}
