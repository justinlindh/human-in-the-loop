import { B } from './balance.js';
import { calendarDate } from './util.js';
import { eraAtLeast } from './eras.js';
import { ERA_STARTS, startEraId } from '../data/era-modes.js';
import { CATEGORIES } from '../data/categories.js';
import { ANGLES } from '../data/angles.js';
import { MODELS } from '../data/models.js';
import { PERIOD_MARKETS } from '../data/early-eras.js';

// Apply the kit before generating people or placing their desks. No ticks, rewards or arrival events.
export function applyEraStart(state, requested) {
  const id = startEraId(requested);
  if (id === 'classic') return;
  const kit = B.eraStarts[id];
  const data = ERA_STARTS[id];
  const period = PERIOD_MARKETS[id];
  const offset = period ? 0 : state.eraSchedule[id];
  Object.assign(state.founding, { startEra: id, calendarOffset: offset, eraScoreMult: kit.scoreMult });
  state.era = { id, since: 0 };
  for (const era of Object.keys(state.eraSchedule)) state.eraSchedule[era] = Math.max(0, state.eraSchedule[era] - offset);
  if (period) {
    const chapters = (id === 'preinternet' ? ['preinternet', 'dotcom', 'web2'] : id === 'dotcom' ? ['dotcom', 'web2'] : ['web2']).map((chapter) => {
      const { weeks, startYear, endYear } = B[chapter];
      return { id: chapter, weeks, startYear, endYear };
    });
    Object.assign(state.founding, { timelineVersion: 'historical-v2', earlyChapters: chapters });
    const duration = chapters.reduce((n, c) => n + c.weeks, 0);
    for (const era of Object.keys(state.eraSchedule)) state.eraSchedule[era] += duration;
    state.eraSchedule.classic = duration;
    let elapsed = 0;
    for (const chapter of chapters) { state.eraSchedule[chapter.id] = elapsed; elapsed += chapter.weeks; }
    if (id === 'dotcom') {
      state.flags.dotcom = { phase: 'growth', entered: 0, float: null, settled: false, recovered: false };
    }
    state.flags.erasVisited = [id];
  }
  state.cash += kit.cash;
  state.officeStage = state.office.stage = kit.officeStage;
  for (const key of data.unlocks) state.unlocks[key] = 0;
  for (const goal of data.skippedGoals) state.goals[goal].skipped = true;
  const { year } = calendarDate(state);
  state.market.unlockedCategories = period ? [...period.categories] : Object.values(CATEGORIES).filter((c) => c.unlockYear <= year).map((c) => c.id);
  state.market.unlockedAngles = period ? [...period.angles] : Object.values(ANGLES).filter((a) => a.id !== 'boxed' && eraAtLeast(state, a.era)).map((a) => a.id);
  for (const m of Object.values(MODELS)) state.models[m.id].available = m.releaseYear <= year;
}
