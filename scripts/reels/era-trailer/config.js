import { OUTPUT as MAIN_OUTPUT, PLAY_URL as MAIN_PLAY_URL } from '../../trailer/config.js';

// The era segment: about 15 s of quick cuts, one per era, each showing a mechanic or joke only that era has,
// for the main trailer. Built alone (`npm run trailer -- --trailer era`) so it can be judged before it is
// placed in the main cut. Video owns the beats and capture items; audio owns the music and the Y2K sting.
// Each early era is a pinned state (PIN_SOURCES, `node scripts/trailer/pin.mjs --trailer era`); the AI-era
// jump reuses the main trailer's capture.

export const OUTPUT = { ...MAIN_OUTPUT, vertical: undefined };
export const PLAY_URL = MAIN_PLAY_URL;

export const CARDS = {};

export const PIN_DIR = 'scripts/reels/era-trailer/snapshots';

// A company founded at `startEra`, played in the page with the balanced bot until `cond` (a JS predicate on s,
// checked after the bot's turn and before the tick), then `after` (JS over s), then loaded as a save.
const FOUNDED = (startEra, seed, cond, after = '') => `(async () => {
  const sim = await import('/src/sim/index.js');
  const b = await import('/src/sim/bots.js');
  const { saveGame } = await import('/src/save/save.js');
  const s = sim.createGame({ seed: ${seed}, startEra: '${startEra}' });
  const cond = (s, c) => (${cond});
  let held = false;
  for (let i = 0; i < 1200 && !s.gameOver; i++) {
    b.botDecide('balanced', s);
    b.botTurn('balanced', s);
    const c = structuredClone(s);
    sim.tick(c);
    if (cond(s, c)) { held = true; break; }
    sim.tick(s);
  }
  if (!held) throw new Error('era segment: the ${startEra} game never reached its moment');
  ${after}
  if (!saveGame(s, localStorage)) throw new Error('era segment: could not save the ${startEra} game');
  const r = window.__HITL.controls.continueGame();
  if (!r.ok) throw new Error('era segment: the game refused the ${startEra} save: ' + (r.reason ?? ''));
})()`;

export const PIN_SOURCES = {
  // A boxed release with a batch of 500 on order: Reports > Inventory.
  inventory: { query: 'seed=1&speed=1&eras', setup: FOUNDED('preinternet', 1, '(s.products.find((p) => p.boxed)?.boxed.installed ?? 0) > 0', `
    const p = s.products.find((x) => x.boxed); s.cash = Math.max(s.cash, 50000);
    sim.dispatch(s, { type: 'orderBatch', productId: p.id, units: 500 });`) },
  // The week before the banker's float offer, the Y2K week, the bust, and a Web 2.0 company with a web project.
  float: { query: 'seed=7&speed=1&eras', setup: FOUNDED('dotcom', 7, "c.pendingDecision?.eventId === 'dotcom_ipo_frenzy'") },
  y2k: { query: 'seed=7&speed=1&eras', setup: FOUNDED('dotcom', 7, 's.week === 103') },
  bust: { query: 'seed=7&speed=1&eras', setup: FOUNDED('dotcom', 7, 's.week === 156') },
  ai: { query: 'seed=7&speed=1&eras', setup: FOUNDED('dotcom', 7, "c.era.id === 'chatgbt' && s.era.id !== 'chatgbt'") },
  web2: { query: 'seed=7&speed=1&eras', setup: FOUNDED('dotcom', 7, "s.era.id === 'web2' && s.projects.some((p) => p.compatibility)") },
};

// Hard cuts, one era each. Provisional times: the first look at the clips sets them.
export const BEATS = [
  { id: 'inventory', item: 'seg-inventory', from: 1.5, dur: 3.0 },
  { id: 'float', item: 'seg-float', from: 7.0, dur: 3.0 },
  { id: 'y2k', item: 'seg-y2k', from: 11.5, dur: 4.0 },
  { id: 'ie6', item: 'seg-web2', from: 2.0, dur: 3.0 },
  { id: 'ai', item: 'seg-ai', from: 8.1, dur: 3.4 },
];

// Audio fills these in: the era stingers, the Y2K sting and the bed under the segment.
export const MUSIC = {
  bed: { file: 'public/audio/music/dotcom/a_full.ogg', gain: -8, fadeIn: 0.3 },
  duck: { db: 6, attack: 0.15, release: 0.4 },
  fadeOut: 1.0,
};

export const VO = { gain: 0, captions: false, lines: [] };
