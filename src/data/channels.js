const rows = [
  ['launch', 'Launch Campaign', 5000, 3, 9, 0.4, 0, 'A proper launch: blog post, demo video, a lot of refreshing.'],
  ['content', 'Content and Blog', 2500, 8, 2, 0.5, 0, 'Slow, steady, useful posts. Builds trust one tutorial at a time.'],
  ['producthunt', 'Product Hunch Day', 1500, 1, 22, 0.6, 0, 'One frantic day of upvotes and asking friends for upvotes.'],
  ['community', 'Community Chat Server', 3000, 12, 1.5, 0.7, 0, 'A home for your weirdest, most loyal users.'],
  ['ads', 'Paid Ads', 12000, 4, 8, 0.1, 0, 'Buy attention by the click. Nobody loves an ad.'],
  ['influencer', 'Influencer Deal', 20000, 2, 20, 0.2, 1, 'A creator with a ring light says your name. Huge, brief.'],
  ['conference', 'Conference Booth', 35000, 2, 14, 1.5, 1, 'Swag, a booth, and handshakes with people who sign contracts.'],
  ['enterprise', 'Enterprise Sales Push', 30000, 10, 2, 0.8, 1, 'Slide decks, security questionnaires, and golf.'],
];

// Fame campaigns: big-ticket marketing from the Consolidation era, priced in weeks of revenue (mrrWeeks) with
// cost as the floor. fame is added when the campaign starts.
const FAME = [
  ['documentary', 'The Documentary', 400000, 4, 10, 1, 2, 'A film crew follows the team for a month. Someone cries in the edit. It might be you.', { mrrWeeks: 6, fame: 20 }],
  ['big_game_ad', 'The Big Game Ad', 800000, 1, 40, 2, 2, 'Thirty seconds between a truck commercial and a truck commercial. Everyone will see it.', { mrrWeeks: 8, fame: 25 }],
  ['stadium', 'Stadium Naming Rights', 2000000, 12, 3, 0.8, 2, 'Your name on a stadium for a season. The fans will call it something else.', { mrrWeeks: 16, fame: 35 }],
];

export const CHANNELS = Object.fromEntries([
  ...rows.map(([id, name, cost, weeks, hype, brand, minStage, desc]) => [id, { id, name, cost, weeks, hype, brand, minStage, desc, fame: 0, mrrWeeks: 0, era: null }]),
  ...FAME.map(([id, name, cost, weeks, hype, brand, minStage, desc, extra]) => [id, { id, name, cost, weeks, hype, brand, minStage, desc, ...extra, era: 'consolidation' }]),
]);
