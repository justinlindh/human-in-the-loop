export const POLICIES = {
  pair: {
    id: 'pair', name: 'AI as Pair, Not Replacement', weeklyCost: 0, unlock: () => true,
    desc: 'Automation works alongside people instead of instead of them. Much less meaning drain, smaller automation output.',
  },
  craft_fridays: {
    id: 'craft_fridays', name: 'Craft Fridays', weeklyCost: 0, unlock: () => true,
    desc: 'Fridays are for making things nice. 10% less output, steady meaning recovery.',
  },
  blameless: {
    id: 'blameless', name: 'Blameless Postmortems', weeklyCost: 200, unlock: (s) => s.stats.incidents >= 1,
    desc: 'Incidents teach instead of scar. Engineers gain knowledge when outages clear. Costs meeting time.',
  },
  comprehension_reviews: {
    id: 'comprehension_reviews', name: 'Code Comprehension Reviews', weeklyCost: 0,
    unlock: (s) => s.comprehensionDebt >= 20 || s.officeStage >= 1,
    desc: 'Someone must understand every change before it ships. Slower projects, steady debt paydown.',
  },
  apprenticeship: {
    id: 'apprenticeship', name: 'Apprenticeship Program', weeklyCost: 1500, unlock: (s) => s.officeStage >= 1,
    desc: 'Structured growth for juniors. Better junior candidates. Costs money every week.',
  },
  sabbatical: {
    id: 'sabbatical', name: 'Sabbatical Program', weeklyCost: 500, unlock: (s) => s.officeStage >= 1,
    desc: 'Lets tired people step away for a month and come back whole. They are paid while gone.',
  },
};
