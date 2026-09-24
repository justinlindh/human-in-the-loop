// Systems that appear as the company grows. reason: the refusal text while locked.
// explainer: the one-card "New!" text (what it is, why it matters now).
// when(state, h): h = { eraIndex }. era: arrives with that era (shown on the era card, not spaced out).
export const UNLOCKS = [
  {
    key: 'marketing', name: 'Marketing', reason: 'Unlocks with your first launch',
    explainer: 'You have a product. Now people need to hear about it. Campaigns build hype; hype brings customers; too much hype and the press calls you a fraud.',
    when: (s) => s.stats.launches >= 1,
  },
  {
    key: 'ops', name: 'Ops and Security', reason: 'Unlocks after your first incident',
    explainer: 'Something went wrong, which means something will go wrong again. Watch security posture, book audits, and keep someone on maintenance.',
    when: (s) => s.stats.incidents >= 1,
  },
  {
    key: 'research', name: 'Research', reason: 'Unlocks with your third launch',
    explainer: 'Three products in, the team keeps rebuilding the same plumbing. Internal tools make every future project a little better.',
    when: (s) => s.stats.launches >= 3,
  },
  {
    key: 'models', name: 'Models', reason: 'Arrives with the ChatGBT moment', era: 'chatgbt',
    explainer: 'Model vendors will rent you a brain by the token. Each has a price, a personality, and a policy on deleting production.',
    when: (s, h) => h.eraIndex >= 1,
  },
  {
    key: 'automation', name: 'Automation', reason: 'Arrives with the ChatGBT moment', era: 'chatgbt',
    explainer: 'Let a model answer support tickets and write marketing copy. It is cheap and tireless. People whose work it does may feel less needed.',
    when: (s, h) => h.eraIndex >= 1,
  },
  {
    key: 'meaning', name: 'Meaning', reason: 'Arrives with the ChatGBT moment', era: 'chatgbt',
    explainer: 'Your people are asking what their job is now. Meaning is how much their work still feels like theirs. Automation drains it; mentoring, hard problems and craft bring it back.',
    when: (s, h) => h.eraIndex >= 1,
  },
  {
    key: 'paths', name: 'Career Paths', reason: 'Unlocks when someone is promoted to senior',
    explainer: 'Seniors choose where to grow: deeper craft, leading people, or watching the machines. Each path changes what they are best at.',
    when: (s) => s.flags.firstSeniorWeek !== undefined,
  },
  {
    key: 'standups', name: 'Standups', reason: 'Unlocks at 5 people',
    explainer: 'Five people is enough to lose track of who is doing what. A standup keeps knowledge moving, in person or in #standup.',
    when: (s) => s.staff.length >= 5,
  },
];

export const UNLOCK_KEYS = UNLOCKS.map((u) => u.key);
export const UNLOCKS_BY_KEY = Object.fromEntries(UNLOCKS.map((u) => [u.key, u]));
