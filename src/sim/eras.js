import { int } from './rng.js';
import { ERAS, ERA_IDS } from '../data/eras.js';
import { EARLY_ERAS, EARLY_ORDER, PERIOD_MARKETS } from '../data/early-eras.js';
import { isPeriod, periodText } from '../data/period-content.js';

const ordinal = (id) => EARLY_ORDER.includes(id) ? EARLY_ORDER.indexOf(id) - EARLY_ORDER.length : Math.max(0, ERA_IDS.indexOf(id));
export const eraIndex = (state) => ordinal(state.era?.id ?? 'classic');
export const currentEra = (state) => EARLY_ERAS.find((e) => e.id === state.era?.id) ?? ERAS[eraIndex(state)];
export const eraAtLeast = (state, id) => eraIndex(state) >= ordinal(id);

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

// Agents arrive with their own era: before it, even ChatGBT-era text must not talk about them.
const AGENT_WORDS = /\b(agents?|agentic)\b/i;
export const isAgentText = (text) => AGENT_WORDS.test(text);
const agentsAllowed = (state, text) => !AGENT_WORDS.test(text) || eraAtLeast(state, 'agents');

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

const modernOffice = /\b(Yak|Slack|Zoom|TikTok|Twitter|LinkedOut|GitHug|podcasts?|cloud|mobile|smartphone|video call|ring light|Product Hunch|Hackerspews|creator economy|remote wave|pull requests?|PRs?|livestream|cryptocurrency|crypto|bitcoin|vibes|touch grass|starred the repo|custom emoji)\b/i;

// Which of the text gates a line trips. Pure in the text, so it is worked out once per distinct line;
// the cache is dropped whole when it grows large (lines with names filled in are many).
const TEXT_MARKS = new Map();
const TEXT_MARKS_MAX = 20000;
function marks(text) {
  let m = TEXT_MARKS.get(text);
  if (m) return m;
  if (TEXT_MARKS.size >= TEXT_MARKS_MAX) TEXT_MARKS.clear();
  m = {
    ai: AI_WORDS.test(text),
    agent: AGENT_WORDS.test(text),
    modern: modernOffice.test(text),
    items: NEEDS_ITEM.filter(([re]) => re.test(text)).map(([, ids]) => ids),
    progress: NEEDS_PROGRESS.filter(([re]) => re.test(text)).map(([, ok]) => ok),
  };
  TEXT_MARKS.set(text, m);
  return m;
}

const officeHas = (state, text) => marks(text).items.every((ids) => (state.office?.placed ?? []).some((p) => ids.includes(p.itemId)));

// Whether text fits the current era, ignoring the office (events gate on the office themselves).
export const eraOnlyAllowsText = (state, text) => {
  const m = marks(String(text ?? ''));
  return (eraIndex(state) > 0 || !m.ai) && (!m.agent || eraAtLeast(state, 'agents'))
    && (!PERIOD_MARKETS[state.era?.id] || !m.modern);
};

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

const progressAllows = (state, text) => !state.stats || marks(text).progress.every((ok) => ok(state));

// Whether a piece of player-facing text fits the current era, the office as it is, and the company's progress.
export const eraAllowsText = (state, text) => {
  const t = String(text ?? '');
  return eraOnlyAllowsText(state, t) && officeHas(state, t) && progressAllows(state, t);
};

// Filters a pool of lines to the ones that fit. If none fit, falls back to the lines that at least fit the
// era, then to neutral office copy, so an exhausted pool never brings back future technology.
export function eraLines(state, lines) {
  if (isPeriod(state)) lines = lines.map((text) => periodText(state, text));
  const ok = lines.filter((l) => eraAllowsText(state, l));
  if (ok.length) return ok;
  const era = lines.filter((l) => eraOnlyAllowsText(state, l));
  return era.length ? era : ['The office is quiet. Someone is thinking.'];
}
