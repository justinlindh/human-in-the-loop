// Mods are multipliers (default 1) except catch, which is additive (default 0).
export const TRAIT_MOD_KEYS = [
  'output', 'meaningDrain', 'meaningRecovery', 'mentorBonus', 'xp', 'hype', 'oversight', 'stamina',
  'features', 'polish', 'reliability', 'novelty', 'resign', 'salary', 'catch',
];

const rows = [
  ['craftsperson', 'Craftsperson', 'Sweats the details. Takes automation of their craft personally.', { polish: 1.3, meaningDrain: 1.5, meaningRecovery: 1.2 }],
  ['hype_machine', 'Hype Machine', 'Can make a settings page sound like the moon landing.', { hype: 1.5 }],
  ['paranoid', 'Paranoid', 'Reads every agent log. Has been right twice.', { oversight: 1.4, catch: 0.15 }],
  ['mentor', 'Mentor', 'Loves teaching. Juniors grow fast around them.', { mentorBonus: 1.6, meaningRecovery: 1.2 }],
  ['night_owl', 'Night Owl', 'Does their best work after everyone leaves.', { output: 1.1, stamina: 1.2 }],
  ['vibe_coder', 'Vibe Coder', 'Ships fast, tests later, maybe. Unbothered by robots.', { features: 1.3, reliability: 0.7, meaningDrain: 0.5 }],
  ['burnout_prone', 'Burnout-prone', 'Brilliant sprints, empty tank.', { output: 1.15, stamina: 1.5 }],
  ['loyal', 'Loyal', 'Would stay through a fire. Has stayed through a fire.', { resign: 0.4 }],
  ['job_hopper', 'Job Hopper', 'LinkedIn status permanently set to "open".', { resign: 1.8 }],
  ['tinkerer', 'Tinkerer', 'Always has a weird prototype running somewhere.', { novelty: 1.3, xp: 1.2 }],
  ['pragmatist', 'Pragmatist', 'If it works, it works. Sleeps well.', { meaningDrain: 0.6, reliability: 1.1 }],
  ['perfectionist', 'Perfectionist', 'Slow, careful, and nothing they ship ever breaks.', { output: 0.85, reliability: 1.3, polish: 1.2 }],
  ['fast_learner', 'Fast Learner', 'Levels up like they read the manual. They did.', { xp: 1.5 }],
  ['old_guard', 'Old Guard', 'Remembers when servers had names. Knows where the bodies are.', { reliability: 1.2, meaningDrain: 1.3, catch: 0.1 }],
  ['ai_enthusiast', 'AI Enthusiast', 'Thrilled the robots are here. Watches them closely anyway.', { meaningDrain: 0.3, oversight: 1.2 }],
  ['people_person', 'People Person', 'Remembers birthdays. Customers love them.', { hype: 1.2, meaningRecovery: 1.1 }],
  ['lone_wolf', 'Lone Wolf', 'Gets a lot done. Headphones stay on.', { output: 1.15, mentorBonus: 0.6 }],
  ['caffeinated', 'Caffeinated', 'Runs on cold brew and optimism.', { output: 1.1, stamina: 1.1 }],
  ['visionary', 'Visionary', 'Has a slide deck about the future. It is sometimes right.', { novelty: 1.4 }],
  ['steady', 'Steady', 'Never too high, never too low. Quietly holds things together.', { stamina: 0.7, resign: 0.7 }],
  ['cynic', 'Cynic', 'Expects everything to break. Builds accordingly.', { meaningRecovery: 0.7, reliability: 1.15 }],
  ['red_teamer', 'Red Teamer', 'Tries to trick the agents for fun. Catches a lot.', { catch: 0.2, oversight: 1.2 }],
];

export const TRAITS = Object.fromEntries(rows.map(([id, name, desc, mods]) => [id, { id, name, desc, mods }]));
