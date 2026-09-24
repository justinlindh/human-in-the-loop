// Structure v2 display content: founder archetypes, funding, goals, eras, and unlock explainers.
// Reads the sim lane's src/data exports when they exist; the fallbacks carry the spec's wording
// so the founding flow and cards work before the data lands.
import { B } from './content.js';

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
  const d = DATA.UNLOCKS?.[key];
  if (d) return d;
  if (FB_UNLOCKS[key]) return FB_UNLOCKS[key];
  if (key.startsWith('policy.')) {
    const p = DATA.POLICIES?.[key.slice(7)];
    return { title: `New policy: ${p?.name ?? key.slice(7)}`, why: p?.desc ?? 'A new company policy is available in Automation, Policies.' };
  }
  return { title: key, why: '' };
}

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
