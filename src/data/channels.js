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

export const CHANNELS = Object.fromEntries(rows.map(([id, name, cost, weeks, hype, brand, minStage, desc]) => [
  id, { id, name, cost, weeks, hype, brand, minStage, desc },
]));
