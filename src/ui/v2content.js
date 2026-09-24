// Structure v2 display content: founder archetypes, funding, goals, eras, and unlock explainers.
// Reads the sim lane's src/data exports when they exist; the fallbacks carry the spec's wording
// so the founding flow and cards work before the data lands.
import { B } from './content.js';
import { ITEMS as DATA_ITEMS } from '../data/items.js';
import { OFFICE_STAGES as DATA_STAGES } from '../data/office.js';

const DATA = Object.assign({}, ...Object.values(import.meta.glob('../data/*.js', { eager: true })));
const list = (v) => (Array.isArray(v) ? v : v ? Object.values(v) : null);

const FB_ARCHETYPES = [
  { id: 'engineer', name: 'Engineer', role: 'engineer', seniority: 'senior', trait: 'fast_learner', strengths: 'Ships features and keeps the lights on.' },
  { id: 'designer', name: 'Designer', role: 'designer', seniority: 'senior', trait: 'craftsperson', strengths: 'Polish, taste, and a strong opinion about fonts.' },
  { id: 'hustler', name: 'Hustler', role: 'marketer', seniority: 'senior', trait: 'hype_machine', strengths: 'Gets people talking before the product exists.' },
  { id: 'operator', name: 'Operator', role: 'support', seniority: 'senior', trait: 'pragmatist', strengths: 'Keeps customers happy and the chaos organized.' },
  { id: 'researcher', name: 'Researcher', role: 'engineer', seniority: 'senior', trait: 'tinkerer', strengths: 'Novel ideas nobody else is building yet.' },
  { id: 'seller', name: 'Seller', role: 'sales', seniority: 'senior', trait: 'loyal', strengths: 'Closes deals and turns trials into customers.' },
];

const FB_FUNDING = [
  { id: 'bootstrapped', name: 'Bootstrapped', cash: 90000, scoreMult: 1, desc: 'Your savings and nobody else\'s. Tight, but every point of score is yours.' },
  { id: 'family', name: 'Friends and Family', cash: 150000, scoreMult: 0.9, desc: 'More runway, and the occasional call asking how "the app" is going.' },
  { id: 'preseed', name: 'Pre-seed VC', cash: 300000, scoreMult: 0.8, desc: 'Lots of runway. Investors will push for growth, and later for automation.' },
];

const FB_GOALS = [
  { id: 'place_desks', name: 'Set up shop', desc: 'Place 2 desks in the garage.' },
  { id: 'start_product', name: 'Start a product', desc: 'Pick a category and an approach in the Build panel.' },
  { id: 'first_launch', name: 'Ship it', desc: 'Launch your first product.' },
  { id: 'first_hire', name: 'Not alone', desc: 'Hire your first employee.' },
  { id: 'office_floor', name: 'Real office', desc: 'Move to an Office Floor.' },
  { id: 'first_award', name: 'Trophy shelf', desc: 'Win an award.' },
  { id: 'category_leader', name: 'Category leader', desc: 'Lead a category.' },
  { id: 'hq', name: 'Headquarters', desc: 'Move into an HQ Building.' },
  { id: 'anniversary_10', name: 'Ten years in', desc: 'Keep the company going for ten years.' },
  { id: 'ipo', name: 'Ring the bell', desc: 'Take the company public.' },
];

const FB_ERAS = [
  { id: 'classic', name: 'Classic SaaS', blurb: 'Build software the old way: people, products, and a lot of coffee.', changes: ['No AI yet. Products are a category plus an approach.', 'Learn building, hiring, launching, and the office.'] },
  { id: 'chatgbt', name: 'The ChatGBT moment', blurb: 'Everyone is talking to a chatbot. Your customers want one too.', changes: ['Model vendors arrive.', 'Copilot and Summarizer angles unlock.', 'Gentle automation: support and marketing copy, up to 50%.'] },
  { id: 'agents', name: 'Agents', blurb: 'Software that does the work, and sometimes a different job.', changes: ['Agent, Workflow, and AI-native angles.', 'Full automation dials, and agents that can go rogue.', 'Oversight becomes a real job.'] },
  { id: 'consolidation', name: 'Consolidation', blurb: 'The land grab is over. Now everyone fights over what is left.', changes: ['Price wars and frequent model deprecations.', 'Incumbents fight back; regulators arrive.', 'Acquisition offers come regularly.'] },
];

const FB_UNLOCKS = {
  marketing: { title: 'Marketing', why: 'You have a product in the world. Campaigns bring hype now; brand keeps customers for years.' },
  ops: { title: 'Ops and Security', why: 'Something broke. Watch your security posture, incidents, and outages here.' },
  research: { title: 'Internal tools', why: 'Engineers can build tools with permanent effects, from the Build panel.' },
  models: { title: 'Model vendors', why: 'AI models are here. Pick vendors for products and automation, and watch for deprecations.' },
  automation: { title: 'Automation', why: 'Agents can take on work. Cheap output, but it drains meaning and needs oversight.' },
  paths: { title: 'Career paths', why: 'A senior can pick a path with one strong perk.' },
  standups: { title: 'Standups', why: 'With a team of five, a standup policy keeps everyone in sync.' },
};

export const ARCHETYPES = list(DATA.ARCHETYPES) ?? FB_ARCHETYPES;
export const FUNDING = list(DATA.FUNDING) ?? FB_FUNDING;
export const GOALS = list(DATA.GOALS) ?? FB_GOALS;
export const ERAS = list(DATA.ERAS) ?? FB_ERAS;
export const ERA = Object.fromEntries(ERAS.map((e) => [e.id, e]));
export const GOAL = Object.fromEntries(GOALS.map((g) => [g.id, g]));

export function unlockInfo(key) {
  const d = Array.isArray(DATA.UNLOCKS) ? DATA.UNLOCKS.find((u) => u.key === key) : DATA.UNLOCKS?.[key];
  if (d) return { title: d.name ?? d.title ?? key, why: d.explainer ?? d.why ?? d.reason ?? '' };
  if (FB_UNLOCKS[key]) return FB_UNLOCKS[key];
  if (key.startsWith('policy.')) {
    const p = DATA.POLICIES?.[key.slice(7)];
    return { title: `New policy: ${p?.name ?? key.slice(7)}`, why: p?.desc ?? 'A new company policy is available in Automation, Policies.' };
  }
  return { title: key, why: '' };
}

const FMT_K = (n) => (Math.abs(n) >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n}`);

// "+$5K, +2 brand" for a goal's reward, or '' when there is none.
export function goalReward(g) {
  if (typeof g?.rewardText === 'string') return g.rewardText;
  const r = g?.reward;
  if (!r) return '';
  if (typeof r === 'string') return r;
  return [r.cash ? `+${FMT_K(r.cash)}` : null, r.brand ? `+${r.brand} brand` : null, g.trophy ? 'a trophy' : null].filter(Boolean).join(', ');
}

const STAT_NAME = { features: 'Features', polish: 'Polish', reliability: 'Reliability', novelty: 'Novelty', hype: 'Hype', sales: 'Sales', support: 'Support', security: 'Security', oversight: 'Oversight' };
// Founder strengths come as stat ids from the data or as a sentence from the fallback.
export const strengthChips = (a) => (Array.isArray(a.strengths) ? a.strengths.map((k) => STAT_NAME[k] ?? k) : []);
export const archetypeBlurb = (a) => a.blurb ?? (typeof a.strengths === 'string' ? a.strengths : '');

export const fundingCash = (f) => f.cash ?? B.funding?.[f.id]?.cash ?? 0;
export const fundingMult = (f) => f.scoreMult ?? B.funding?.[f.id]?.scoreMult ?? 1;

export const LOGO_COLORS = ['#ffb020', '#4f8cff', '#ff7eb6', '#34c38f', '#9b6bff', '#e08a3c', '#3fb6b0', '#e5484d'];

// A stable look for each archetype's card portrait.
export function archetypePerson(a, i = 0) {
  const skins = [1, 3, 0, 4, 2, 5];
  const hairs = [0, 4, 1, 6, 3, 7];
  const colors = ['#2b1d16', '#c68b4e', '#1c1c24', '#7a4b2a', '#e8c170', '#a3442f'];
  const acc = ['glasses', 'none', 'headphones', 'none', 'beanie', 'cap'];
  return {
    id: `arch-${a.id}`, role: a.role, mood: 'ok',
    appearance: { skin: skins[i % 6], hair: hairs[i % 6], hairColor: colors[i % 6], shirt: null, accessory: acc[i % 6], build: 1 },
  };
}

// ---------- office grid and build catalog ----------

const FB_GRIDS = [
  { w: 9, h: 7, door: { x: 4, y: 6 }, blocked: [] },
  { w: 15, h: 12, door: { x: 7, y: 11 }, blocked: [] },
  { w: 21, h: 16, door: { x: 10, y: 15 }, blocked: [] },
];

export function stageGrid(stage) {
  const g = DATA_STAGES[stage]?.grid ?? FB_GRIDS[stage] ?? FB_GRIDS[0];
  return { w: g.w, h: g.h, door: DATA_STAGES[stage]?.door ?? g.door ?? { x: g.w - 1, y: g.h - 1 }, blocked: DATA_STAGES[stage]?.blocked ?? g.blocked ?? [] };
}

// Furniture the build palette offers until src/data/items.js carries it.
const FB_FURNITURE = [
  { id: 'desk', name: 'Desk Set', desc: 'A desk, a chair, and a screen. One person each.', costs: [800], footprint: { w: 2, h: 1 }, minStage: 0 },
  { id: 'meeting_table', name: 'Meeting Table', desc: 'Where standups and arguments happen.', costs: [2500], footprint: { w: 3, h: 2 }, minStage: 0 },
  { id: 'whiteboard', name: 'Whiteboard', desc: 'Nearby desks think a little weirder.', costs: [900], footprint: { w: 2, h: 1 }, minStage: 0, adjacency: { radius: 2, key: 'novelty', value: 0.03 } },
  { id: 'coffee_corner', name: 'Coffee Corner', desc: 'Nearby desks get their energy back faster.', costs: [1500], footprint: { w: 2, h: 1 }, minStage: 0, adjacency: { radius: 3, key: 'staminaRecovery', value: 0.05 } },
  { id: 'plant', name: 'Potted Plant', desc: 'Nearby desks feel a bit better about their work.', costs: [300], footprint: { w: 1, h: 1 }, minStage: 0, adjacency: { radius: 2, key: 'meaningRecovery', value: 0.03 } },
  { id: 'bookshelf', name: 'Bookshelf', desc: 'Nearby desks pick up the systems faster.', costs: [1200], footprint: { w: 2, h: 1 }, minStage: 0, adjacency: { radius: 2, key: 'knowledgeGain', value: 0.05 } },
];

const FB_SHOP_FOOTPRINT = { espresso: { w: 1, h: 1 }, plant_wall: { w: 2, h: 1 }, nap_pod: { w: 2, h: 1 }, arcade: { w: 1, h: 1 }, standing_desk: { w: 2, h: 1 }, whiteboard_wall: { w: 2, h: 1 }, library: { w: 2, h: 2 }, monitoring_wall: { w: 3, h: 1 }, server_rack: { w: 1, h: 1 }, trophy_case: { w: 1, h: 1 } };

// One entry per placeable thing: { id, name, desc, kind, costs, effects, footprint, adjacency, minStage, requires }.
export const CATALOG = (() => {
  const out = {};
  const dataHasFurniture = Object.values(DATA_ITEMS).some((it) => it.kind === 'furniture');
  if (!dataHasFurniture) for (const f of FB_FURNITURE) out[f.id] = { kind: 'furniture', effects: [], requires: null, adjacency: null, ...f };
  for (const it of Object.values(DATA_ITEMS)) {
    out[it.id] = {
      ...it,
      kind: it.kind ?? 'shop',
      footprint: it.footprint ?? FB_SHOP_FOOTPRINT[it.id] ?? { w: 1, h: 1 },
      adjacency: it.adjacency ?? null,
      costs: it.costs ?? [it.cost ?? it.price ?? 0],
      effects: it.effects ?? [],
    };
  }
  return out;
})();

export const isDesk = (itemId) => itemId === 'desk' || itemId === 'desk_set' || CATALOG[itemId]?.desk === true;
