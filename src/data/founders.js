// Founder archetypes offered at founding. strengths: the two skills that start a few points higher (B.founderStrengthBonus).
const rows = [
  ['engineer', 'The Engineer', 'engineer', 'senior', 'pragmatist', ['features', 'reliability'],
    'Has opinions about databases and a side project from 2011 that still runs. Builds things that work.'],
  ['designer', 'The Designer', 'designer', 'mid', 'craftsperson', ['polish', 'novelty'],
    'Notices the one pixel. Will not ship the ugly version, which is annoying and usually right.'],
  ['hustler', 'The Hustler', 'marketer', 'mid', 'hype_machine', ['novelty', 'polish'],
    'Can sell a login page as a movement. Knows a guy at every conference.'],
  ['operator', 'The Operator', 'security', 'mid', 'steady', ['reliability', 'features'],
    'Owns the checklists, the backups, and the calm voice during outages.'],
  ['researcher', 'The Researcher', 'engineer', 'senior', 'tinkerer', ['novelty', 'features'],
    'Left a lab to "ship something real". Still reads papers at lunch. Ideas are strange and good.'],
  ['seller', 'The Seller', 'sales', 'mid', 'people_person', ['features', 'novelty'],
    'Closed a deal at a wedding. Remembers every customer\'s dog\'s name.'],
];

export const ARCHETYPES = Object.fromEntries(rows.map(([id, name, role, seniority, trait, strengths, blurb]) => [
  id, { id, name, role, seniority, trait, strengths, blurb },
]));

export const DEFAULT_FOUNDERS = ['engineer', 'designer'];
