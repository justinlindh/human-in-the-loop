export const POLICIES = {
  daily_standups: {
    id: 'daily_standups', lockText: 'Always available', name: 'Daily Standups', weeklyCost: 0, unlock: () => true, excludes: 'async_standups',
    desc: 'Everyone gathers at the whiteboard for quick updates. A little less output, better knowledge sharing, and a small meaning lift.',
  },
  async_standups: {
    id: 'async_standups', lockText: 'Always available', name: 'Async Standups', weeklyCost: 0, unlock: () => true, excludes: 'daily_standups',
    desc: 'Updates go to the #standup channel instead. No output cost, a smaller knowledge boost, and the quiet ones stop posting.',
  },
  pair: {
    id: 'pair', lockText: 'Always available', name: 'AI as Pair, Not Replacement', weeklyCost: 0, unlock: () => true,
    desc: 'Automation works alongside people, not in place of them. Much less meaning drain, smaller automation output.',
  },
  craft_fridays: {
    id: 'craft_fridays', lockText: 'Always available', name: 'Craft Fridays', weeklyCost: 0, unlock: () => true,
    desc: 'Fridays are for making things nice. 10% less output, steady meaning recovery.',
  },
  blameless: {
    id: 'blameless', lockText: 'Unlocks after your first incident', name: 'Blameless Postmortems', weeklyCost: 200, unlock: (s) => s.stats.incidents >= 1,
    desc: 'Incidents teach instead of scar. Engineers gain knowledge when outages clear. Costs meeting time.',
  },
  comprehension_reviews: {
    id: 'comprehension_reviews', lockText: 'Unlocks at 20 comprehension debt or on the Office Floor', name: 'Code Comprehension Reviews', weeklyCost: 0,
    unlock: (s) => s.comprehensionDebt >= 20 || s.officeStage >= 1,
    desc: 'Someone must understand every change before it ships. Slower projects, steady debt paydown.',
  },
  apprenticeship: {
    id: 'apprenticeship', lockText: 'Needs the Office Floor', name: 'Apprenticeship Program', weeklyCost: 1500, unlock: (s) => s.officeStage >= 1,
    desc: 'Structured growth for juniors. Better junior candidates. Costs money every week.',
  },
  sabbatical: {
    id: 'sabbatical', lockText: 'Needs the Office Floor', name: 'Sabbatical Program', weeklyCost: 500, unlock: (s) => s.officeStage >= 1,
    desc: 'Lets tired people step away for a month and come back whole. They are paid while gone.',
  },
};
