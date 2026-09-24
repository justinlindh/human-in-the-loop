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
  [/\bcouch/i, ['couch']],
  [/foosball/i, ['foosball']],
  [/ping pong/i, ['ping_pong_table']],
  [/espresso|coffee machine/i, ['espresso', 'coffee_corner']],
  [/nap pod/i, ['nap_pod']],
  [/arcade/i, ['arcade']],
  [/bookshel/i, ['bookshelf', 'library']],
  [/standing desk/i, ['standing_desk']],
  [/trophy case/i, ['trophy_case']],
  [/server rack|the rack\b/i, ['server_rack']],
  [/meeting table/i, ['meeting_table']],
];

const officeHas = (state, text) => NEEDS_ITEM.every(([re, ids]) => !re.test(text)
  || (state.office?.placed ?? []).some((p) => ids.includes(p.itemId)));

// Whether text fits the current era, ignoring the office (events gate on the office themselves).
export const eraOnlyAllowsText = (state, text) => eraIndex(state) > 0 || !isAiText(String(text ?? ''));

// Words that assume progress the company may not have yet, and what they need.
export const NEEDS_PROGRESS = [
  // Something has launched and people use it.
  [/\b(launched|since launch|after launch|shipped|customers?|users|reviews?|five-star|revenue|MRR|churn|signups?|on-?call|support tickets?|the pager|in prod|production)\b/i,
    (s) => s.stats.launches > 0 && s.products.some((p) => !p.killed)],
  // A past incident.
  [/\b(postmortem|the last incident|last outage)\b/i, (s) => s.stats.incidents > 0],
  // Most people are in the office.
  [/\b(donuts?|kitchen|lunch|pizza|in the office|at my desk)\b/i, (s) => (s.staff?.filter((p) => p.remote).length ?? 0) * 2 < (s.staff?.length ?? 0)],
];

const progressAllows = (state, text) => NEEDS_PROGRESS.every(([re, ok]) => !re.test(text) || !state.stats || ok(state));

// Whether a piece of player-facing text fits the current era, the office as it is, and the company's progress.
export const eraAllowsText = (state, text) => {
  const t = String(text ?? '');
  return (eraIndex(state) > 0 || !isAiText(t)) && officeHas(state, t) && progressAllows(state, t);
};

// Filters a pool of lines to the ones that fit. If none fit, falls back to the lines that at least fit the
// era, then to the whole pool, so a pick never comes back empty.
export function eraLines(state, lines) {
  const ok = lines.filter((l) => eraAllowsText(state, l));
  if (ok.length) return ok;
  const era = lines.filter((l) => eraOnlyAllowsText(state, l));
  return era.length ? era : lines;
}
