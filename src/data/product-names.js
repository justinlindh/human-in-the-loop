import { B } from '../sim/balance.js';
import { FOR_SALE } from './forsale.js';
import { ERA_IDS } from './eras.js';
import { DOTCOM_NAMES, PERIOD_MARKETS } from './early-eras.js';

// Product names: a word plus a suffix, a category's own word most of the time, and a joke name every fifth one.
export const PREFIX = ['Inbox', 'Plan', 'Desk', 'Note', 'Deal', 'Chart', 'Pixel', 'Ship', 'Ledger', 'Brief', 'Loop', 'Hire', 'Clip', 'Vault', 'Flow', 'Pilot', 'Nudge', 'Tidy', 'Quill', 'Beacon'];
export const SUFFIX = ['ly', 'ify', 'bot', 'wise', 'hub', 'io', 'genie', 'pal', 'sense', 'mind', 'ster', 'o', 'able', 'dex', 'ware'];
// Joke names, each with the era it can first appear in, so nobody names a product after AI before AI exists.
export const SILLY_ERA = {
  'Clippy Returns': 'classic', 'Just Ship It': 'classic', 'Excel But Worse': 'classic', 'Web Two Point Oh': 'classic',
  'Cloudy With Sync': 'classic', 'Synergy.ai': 'chatgbt', 'Yet Another Copilot': 'chatgbt', 'Prompt and Circumstance': 'chatgbt',
  'Hallucinate Less': 'chatgbt', 'Summarize This': 'chatgbt', 'Vibe Ledger': 'chatgbt', 'Tokenomicon': 'chatgbt',
  'Agentic McAgentface': 'agents',
};
export const SILLY = Object.keys(SILLY_ERA);
export const CAT_WORD = { notes: 'Note', email: 'Inbox', pm: 'Plan', support: 'Desk', crm: 'Deal', analytics: 'Chart', design: 'Pixel', devtools: 'Ship', hr: 'People', recruiting: 'Hire', accounting: 'Ledger', video: 'Clip', legal: 'Brief', security: 'Vault' };

const sillyFor = (eraId) => {
  const at = Math.max(0, ERA_IDS.indexOf(eraId));
  return SILLY.filter((n) => n.length <= B.productNameMax && ERA_IDS.indexOf(SILLY_ERA[n]) <= at);
};

// roll(k) returns an integer in [0, k); n counts names asked for, and every fifth is a joke from eraId or earlier.
export function productName(category, roll, n, eraId = 'classic') {
  const pick = (a) => a[roll(a.length)];
  if (PERIOD_MARKETS[eraId]) return n % 5 === 0 ? pick(DOTCOM_NAMES) : `${category && CAT_WORD[category] || pick(PREFIX)}${pick(['ware', 'Works', 'Desk', 'Net'])}`.slice(0, B.productNameMax);
  if (n % 5 === 0) return pick(sillyFor(eraId));
  const base = category && CAT_WORD[category] && roll(10) < 7 ? CAT_WORD[category] : pick(PREFIX);
  return `${base}${pick(SUFFIX)}`.slice(0, B.productNameMax);
}

// A 32-bit integer hash, so bots can name products without drawing from the game's rng.
function mix(...xs) {
  let h = 0x9e3779b9;
  for (const x of xs) {
    h = Math.imul(h ^ (x | 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

// The name a bot gives its next new product: fixed by the seed and how many products and projects exist, never
// one the company already uses, and never a for-sale company's (the for-sale round skips names the company uses,
// so sharing one would change which companies are offered).
export function botProductName(state, category) {
  const n = state.stats.launches + state.projects.length + 1;
  const used = new Set([...state.products, ...state.projects, ...FOR_SALE].map((p) => p.name));
  for (let k = 0; k < 64; k++) {
    let i = 0;
    const name = productName(category, (m) => mix(state.seed, n, k, i++) % m, n + k, state.era.id);
    if (!used.has(name)) return name;
  }
  return `${PREFIX[n % PREFIX.length]} ${n}`;
}
