import { B } from './balance.js';
import { createRng, sideRng, chance, pick } from './rng.js';
import { registerAction, registerSystem } from './registry.js';
import { emitChat } from './chat.js';
import { STATIONS, STATION_IDS, STATION_SWAP_LINES, STATION_ARGUMENT_LINES, stationName } from '../data/stations.js';

// The boombox's radio: state.radio = { on, station }. The station is flavour; the boombox's adjacency pays
// only while the radio is on (src/sim/bonus.js). Staff have a taste, a station derived from the game seed and
// their id, and remark on the radio now and then: they like it, they don't, and sometimes two of them argue.
// Rarely someone changes the station to theirs while you're not looking. None of it costs anything.

// The radio draws from its own stream, so with B.boombox.enabled false a seeded game plays as without it.
function side(ctx, salt) {
  const { state } = ctx;
  return { ...ctx, rng: createRng(((state.seed >>> 0) * 4241 + state.week * 613 + salt) >>> 0) };
}

const idNumber = (id) => [...String(id)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

// A person's taste: one station, fixed by the game seed and their id.
export const tasteFor = (state, personId) => pick(sideRng(state.seed, 'taste', idNumber(personId)), STATION_IDS);

export const hasBoombox = (state) => state.office.placed.some((p) => p.itemId === 'boombox');

function setRadio(ctx, on, station, by = null) {
  const { state } = ctx;
  state.radio = { on, station };
  ctx.emit({ type: 'radio', on, station, by });
}

// Placing the boombox turns it on, at the last station it played or lo-fi; selling it switches it off and
// keeps the station.
export function boomboxPlaced(ctx) {
  setRadio(ctx, true, ctx.state.radio?.station ?? 'lofi');
}
export function boomboxSold(ctx) {
  setRadio(ctx, false, ctx.state.radio?.station ?? null);
}

const listeners = (state) => state.staff.filter((p) => p.mood !== 'away' && !p.remote);

function remark(ctx) {
  const { state } = ctx;
  const people = listeners(state);
  if (!people.length) return;
  const station = STATIONS.find((s) => s.id === state.radio.station);
  if (!station) return;
  const who = pick(ctx.rng, people);
  const verdict = who.taste === station.id ? 'like' : 'dislike';
  ctx.emit({ type: 'radioTaste', staffId: who.id, station: station.id, verdict });
  const msg = emitChat(ctx, { channel: 'random', person: who, text: pick(ctx.rng, station[verdict]) });
  // A fan of the station draws a groan in the thread from someone who isn't, and the reverse. The reply is a
  // Yak line only: one radioTaste event per gap.
  const other = people.filter((p) => p !== who && (p.taste === station.id) !== (verdict === 'like'));
  if (other.length && chance(ctx.rng, B.boombox.argueChance)) {
    const second = pick(ctx.rng, other);
    const lines = verdict === 'like' ? [...station.dislike, ...STATION_ARGUMENT_LINES] : station.like;
    emitChat(ctx, { channel: 'random', person: second, text: pick(ctx.rng, lines), replyTo: msg?.id });
  }
  state.flags.radioRemarkWeek = state.week;
}

function swap(ctx) {
  const { state } = ctx;
  const people = listeners(state).filter((p) => !p.founder && p.taste !== state.radio.station);
  if (!people.length) return;
  const who = pick(ctx.rng, people);
  setRadio(ctx, state.radio.on, who.taste, who.id);
  emitChat(ctx, { channel: 'random', person: who, text: pick(ctx.rng, STATION_SWAP_LINES).replaceAll('{station}', stationName(who.taste)) });
}

export function radioSystem(outer) {
  if (!B.boombox.enabled) return;
  const ctx = side(outer, 1);
  const { state } = ctx;
  state.radio ??= { on: false, station: null };
  for (const p of state.staff) p.taste ??= tasteFor(state, p.id);
  if (!state.radio.on || !hasBoombox(state)) return;
  if (chance(ctx.rng, B.boombox.swapChance)) { swap(ctx); return; }
  if (state.week - (state.flags.radioRemarkWeek ?? -Infinity) >= B.boombox.tasteGapWeeks && chance(ctx.rng, B.boombox.tasteChance)) remark(ctx);
}

registerSystem('radio', radioSystem, 93);

registerAction('setRadio', (ctx, { on, station } = {}) => {
  const { state } = ctx;
  if (!hasBoombox(state)) return { ok: false, reason: 'No boombox' };
  if (on === undefined && station === undefined) return { ok: false, reason: 'Nothing to change' };
  if (station !== undefined && !STATION_IDS.includes(station)) return { ok: false, reason: 'Unknown station' };
  setRadio(ctx, on ?? state.radio?.on ?? false, station ?? state.radio?.station ?? 'lofi');
  return { ok: true };
});
