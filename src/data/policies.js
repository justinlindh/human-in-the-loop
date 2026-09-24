// unlock(state): the trigger. with: opens alongside that unlock key, without a card of its own.
// era: arrives with that era. Otherwise policies unlock one at a time (see checkUnlocks).
export const POLICIES = {
  daily_standups: {
    id: 'daily_standups', with: 'standups', lockText: 'Unlocks at 5 people', name: 'Daily Standups', weeklyCost: 0, unlock: (s) => s.staff.length >= 5, excludes: 'async_standups',
    desc: 'Everyone gathers at the whiteboard for quick updates. A little less output, better knowledge sharing, and a small meaning lift.',
  },
  async_standups: {
    id: 'async_standups', with: 'standups', lockText: 'Unlocks at 5 people', name: 'Async Standups', weeklyCost: 0, unlock: (s) => s.staff.length >= 5, excludes: 'daily_standups',
    desc: 'Updates go to the #standup channel instead. No output cost, a smaller knowledge boost, and the quiet ones stop posting.',
  },
  pair: {
    id: 'pair', era: 'chatgbt', lockText: 'Arrives with the ChatGBT moment', name: 'AI as Pair, Not Replacement', weeklyCost: 0, unlock: (s) => s.era.id !== 'classic',
    desc: 'Automation works alongside people, not in place of them. Much less meaning drain, smaller automation output.',
  },
  craft_fridays: {
    id: 'craft_fridays', lockText: 'Unlocks at 4 people', name: 'Craft Fridays', weeklyCost: 0, unlock: (s) => s.staff.length >= 4,
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
  no_crunch: {
    id: 'no_crunch', lockText: 'Unlocks when someone is running on empty', name: 'No Crunch', weeklyCost: 0,
    unlock: (s) => s.staff.some((p) => (p.strain ?? 0) >= 60),
    desc: 'Nobody works nights to hit a date. Exhaustion builds half as fast; a little less output.',
  },
  incentives: {
    id: 'incentives', lockText: 'Unlocks with a team of 8 and three launches', name: 'Incentives Program', weeklyCost: 300,
    unlock: (s) => s.staff.length >= 8 && s.stats.launches >= 3,
    desc: 'Every couple of months the top performer gets a reward. More output for a while, a happy winner, a slightly envious team. It wears thin.',
  },
};
