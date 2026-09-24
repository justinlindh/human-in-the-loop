// Career paths chosen at promotion to senior. mods use the trait vocabulary plus path keys.
// Additive keys (default 0): catch, brandPerWeek, postureFlat. Everything else multiplies (default 1).
const rows = [
  ['architect', 'Architect', 'engineer', 'Pays down comprehension debt faster and learns the systems quicker.', { debtPaydown: 1.4, knowledgeGain: 1.3 }],
  ['tech_lead', 'Tech Lead', 'engineer', 'Mentees grow much faster.', { mentorBonus: 1.4 }],
  ['ai_wrangler', 'AI Wrangler', 'engineer', 'A natural overseer: more oversight hours, better catches, and oversight feels meaningful.', { oversight: 1.4, catch: 0.15, oversightMeaning: 1.5 }],
  ['staff_engineer', 'Staff Engineer', 'engineer', 'Hard problems yield more novelty, and features come out stronger.', { hardProblemNovelty: 1.4, features: 1.15 }],
  ['ux_lead', 'UX Lead', 'designer', 'Everything they touch gets more polish.', { polish: 1.3 }],
  ['brand_designer', 'Brand Designer', 'designer', 'A steady trickle of brand, every week.', { brandPerWeek: 0.03 }],
  ['growth_lead', 'Growth Lead', 'marketer', 'Campaigns and posts generate more hype.', { hype: 1.35 }],
  ['brand_lead', 'Brand Lead', 'marketer', 'Campaigns build more brand.', { brandGain: 1.4 }],
  ['support_lead', 'Support Lead', 'support', 'Covers more tickets and keeps customers from leaving.', { supportHours: 1.4, churn: 0.9 }],
  ['community_manager', 'Community Manager', 'support', 'Builds a fan base: a little brand and hype every week.', { brandPerWeek: 0.02, hype: 1.15 }],
  ['red_team_lead', 'Red Team Lead', 'security', 'Hardens everything. Big security posture bonus.', { postureFlat: 8 }],
  ['incident_commander', 'Incident Commander', 'security', 'Runs outages like drills. Fixes come much faster.', { outageFix: 1.4 }],
  ['enterprise_ae', 'Enterprise AE', 'sales', 'Closes big deals. Stronger sales boost.', { salesBoost: 1.5 }],
  ['partnerships', 'Partnerships', 'sales', 'Opens doors. Customers arrive a bit faster everywhere.', { acquisition: 1.15 }],
];

export const PATHS = Object.fromEntries(rows.map(([id, name, role, desc, mods]) => [id, { id, name, role, desc, mods }]));

export const ADDITIVE_PATH_KEYS = ['catch', 'brandPerWeek', 'postureFlat'];
