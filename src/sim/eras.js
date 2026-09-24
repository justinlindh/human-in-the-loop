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

// Whether a piece of player-facing text fits the current era.
export const eraAllowsText = (state, text) => eraIndex(state) > 0 || !isAiText(String(text ?? ''));

// Filters a pool of lines to the ones the current era allows.
// Falls back to the whole pool if nothing in it fits, so a pick never comes back empty.
export function eraLines(state, lines) {
  if (eraIndex(state) > 0) return lines;
  const ok = lines.filter((l) => !isAiText(l));
  return ok.length ? ok : lines;
}
