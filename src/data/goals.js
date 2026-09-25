// Milestones shown in the Goals card. done(state, h) is checked every week and after every action;
// h = { mrr, customers, leaders, ipoReady, desks, treeDone }. reward: { cash, brand } applied once; rewardText: the
// same in short words ("+$5K, +2 brand"); trophy: shown on the shelf. progress(state, h), on count goals, returns { n, of }
// for a progress bar, with n capped at of; h comes from goalHelpers in src/sim/goals.js.
export const GOALS = [
  {
    id: 'place_desks', group: 'Getting started', name: 'Place two desks', trophy: false,
    desc: 'Buy two desk sets and put them somewhere sensible. Or anywhere.',
    reward: { cash: 0, brand: 0 }, done: (s, h) => h.desks >= 2,
    progress: (s, h) => ({ n: Math.min(2, h.desks), of: 2 }),
  },
  {
    id: 'start_product', group: 'Getting started', name: 'Start a product', trophy: false,
    desc: 'Pick a category and an approach in the Build panel and get the founders on it.',
    reward: { cash: 0, brand: 0 }, done: (s) => s.stats.launches > 0 || s.projects.some((j) => j.kind === 'new'),
  },
  {
    id: 'first_launch', group: 'Getting started', name: 'Launch it', trophy: true,
    desc: 'Ship your first product. The reviewers are waiting, sharpening their adjectives.',
    reward: { cash: 5000, brand: 2 }, done: (s) => s.stats.launches >= 1,
  },
  {
    id: 'first_hire', group: 'Growing', name: 'First hire', trophy: false,
    desc: 'Hire someone who did not found the company. They will ask where the forks are.',
    reward: { cash: 0, brand: 1 }, done: (s) => s.stats.hires >= 1,
  },
  {
    id: 'first_incident', group: 'Growing', name: 'Survive an incident', trophy: true,
    desc: 'Something breaks, you fix it, you write it down. Welcome to operations.',
    reward: { cash: 3000, brand: 0 }, done: (s) => s.stats.incidents >= 1 && !s.outage,
  },
  {
    id: 'customers_1k', group: 'Growing', name: '1,000 customers', trophy: true,
    desc: 'A thousand people pay you money every month. Some of them even use the product.',
    reward: { cash: 10000, brand: 2 }, done: (s, h) => h.customers >= 1000,
    progress: (s, h) => ({ n: Math.min(1000, h.customers), of: 1000 }),
  },
  {
    id: 'team_10', group: 'Growing', name: 'A team of ten', trophy: false,
    desc: 'Ten people. Someone will now suggest a team-building exercise.',
    reward: { cash: 0, brand: 2 }, done: (s) => s.staff.length >= 10,
    progress: (s) => ({ n: Math.min(10, s.staff.length), of: 10 }),
  },
  {
    id: 'office_floor', group: 'Growing', name: 'Move to the Office Floor', trophy: true,
    desc: 'Leave the garage. Say goodbye to the lawnmower.',
    reward: { cash: 0, brand: 3 }, done: (s) => s.officeStage >= 1,
  },
  {
    id: 'first_award', group: 'Recognition', name: 'Win a Saasie', trophy: true,
    desc: 'Product of the Year. The trophy is heavy and slightly ugly. Perfect.',
    reward: { cash: 10000, brand: 3 }, done: (s) => s.stats.awards >= 1,
  },
  {
    id: 'mrr_100k', group: 'Recognition', name: '$100k MRR', trophy: true,
    desc: 'A hundred thousand dollars a month. Your accountant starts returning calls.',
    reward: { cash: 20000, brand: 2 }, done: (s, h) => h.mrr >= 100000,
    progress: (s, h) => ({ n: Math.min(100000, Math.floor(h.mrr)), of: 100000 }),
  },
  {
    id: 'category_leader', group: 'Recognition', name: 'Lead a category', trophy: true,
    desc: 'Beat the incumbent in its own category. They will pretend not to notice.',
    reward: { cash: 25000, brand: 4 }, done: (s, h) => h.leaders >= 1,
  },
  {
    id: 'legend', group: 'Recognition', name: 'A Legend', trophy: true,
    desc: 'Someone on the team reaches level 20. People tell stories about them in the kitchen.',
    reward: { cash: 0, brand: 3 }, done: (s) => s.staff.some((p) => p.legend),
  },
  {
    id: 'research_tree', group: 'Recognition', name: 'Finish a research tree', trophy: true,
    desc: 'Build an internal tool on top of another internal tool. Peak engineering.',
    reward: { cash: 5000, brand: 1 }, done: (s, h) => h.treeDone,
  },
  {
    id: 'hq', group: 'The big leagues', name: 'Move into HQ', trophy: true,
    desc: 'A whole building. With your name on it. In a font you will regret.',
    reward: { cash: 0, brand: 5 }, done: (s) => s.officeStage >= 2,
  },
  {
    id: 'acquisition_offer', group: 'The big leagues', name: 'Get an acquisition offer', trophy: true,
    desc: 'Someone bigger wants to buy you. You can say yes and retire, or keep going.',
    reward: { cash: 0, brand: 2 }, done: (s) => !!s.flags.acquisitionOfferWeek,
  },
  {
    id: 'ipo', group: 'The big leagues', name: 'IPO ready', trophy: true,
    desc: 'The bankers say you could go public. You could also keep going. Nobody retires on a Tuesday.',
    reward: { cash: 0, brand: 3 }, done: (s, h) => h.ipoReady,
  },
  {
    id: 'five_years', group: 'Staying power', name: 'Five years', trophy: true,
    desc: 'Most companies do not see year five. Yours did, and bought a cake.',
    reward: { cash: 10000, brand: 2 }, done: (s) => s.week >= 260,
    progress: (s) => ({ n: Math.min(260, s.week), of: 260 }),
  },
  {
    id: 'ten_years', group: 'Staying power', name: 'Ten years', trophy: true,
    desc: 'A decade. The founders have grey hair and very strong opinions about databases.',
    reward: { cash: 25000, brand: 3 }, done: (s) => s.week >= 520,
    progress: (s) => ({ n: Math.min(520, s.week), of: 520 }),
  },
];

const money = (n) => (n >= 1000 ? `$${n / 1000}K` : `$${n}`);
for (const g of GOALS) {
  g.rewardText = [g.reward.cash ? `+${money(g.reward.cash)}` : null, g.reward.brand ? `+${g.reward.brand} brand` : null].filter(Boolean).join(', ');
}

export const GOAL_IDS = GOALS.map((g) => g.id);
