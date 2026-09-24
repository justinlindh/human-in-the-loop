import { int } from './rng.js';
import { ERAS, ERA_IDS } from '../data/eras.js';

export const eraIndex = (state) => Math.max(0, ERA_IDS.indexOf(state.era?.id ?? 'classic'));
export const currentEra = (state) => ERAS[eraIndex(state)];
export const eraAtLeast = (state, id) => eraIndex(state) >= ERA_IDS.indexOf(id);

// Arrival weeks for this run: each era lands within a quarter of its place on the timeline.
export function rollEraSchedule(rng, jitter) {
  const out = {};
  let prev = 0;
  for (const e of ERAS.slice(1)) {
    out[e.id] = Math.max(prev + 1, e.week + int(rng, -jitter, jitter));
    prev = out[e.id];
  }
  return out;
}

// Words that only make sense once AI has arrived. Classic-era content must not use them.
const AI_WORDS = /\b(AI|LLMs?|GPUs?|agents?|agentic|models?|prompts?|prompting|ChatGBT|Claudius|Gemenai|Grokk|Llamarama|DeepSleep|Mistrale|copilots?|fine-?tunes?|fine-?tuning|hallucinat\w*|tokens?|automation|automated|automate|robots?|chatbots?|bots?|vibe.?cod\w*|inference|embeddings?|open weights|guardrails|sparkle|summarizers?)\b/i;

export const isAiText = (text) => AI_WORDS.test(text);

// Lines that name a piece of office furniture only fit when the office has one.
const NEEDS_ITEM = [
  [/office plant/i, ['plant', 'plant_wall']],
  [/whiteboard/i, ['whiteboard', 'whiteboard_wall']],
];

const officeHas = (state, text) => NEEDS_ITEM.every(([re, ids]) => !re.test(text)
  || (state.office?.placed ?? []).some((p) => ids.includes(p.itemId)));

// Whether a piece of player-facing text fits the current era and the office as it is.
export const eraAllowsText = (state, text) => (eraIndex(state) > 0 || !isAiText(String(text ?? ''))) && officeHas(state, String(text ?? ''));

// Filters a pool of lines to the ones that fit the era and the office.
// Falls back to the whole pool if nothing in it fits, so a pick never comes back empty.
export function eraLines(state, lines) {
  const ok = lines.filter((l) => eraAllowsText(state, l));
  return ok.length ? ok : lines;
}
