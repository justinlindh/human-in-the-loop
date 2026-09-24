// Founder archetypes offered at founding. builder: engineer or designer; warning: a plain line for the card, or null. strengths: the two skills that start a few points higher (B.founderStrengthBonus).
const rows = [
  ['engineer', 'The Engineer', 'engineer', 'senior', 'pragmatist', ['features', 'reliability'],
    'Has opinions about databases and a side project from 2011 that still runs. Builds things that work.'],
  ['designer', 'The Designer', 'designer', 'mid', 'craftsperson', ['polish', 'novelty'],
    'Notices the one pixel. Will not ship the ugly version, which is annoying and usually right.'],
  ['hustler', 'The Hustler', 'marketer', 'mid', 'hype_machine', ['novelty', 'polish'],
    'Can sell a login page as a movement. Knows a guy at every conference.'],
  ['operator', 'The Operator', 'security', 'mid', 'steady', ['reliability', 'polish'],
    'Owns the checklists, the backups, and the calm voice during outages.'],
  ['researcher', 'The Researcher', 'engineer', 'senior', 'tinkerer', ['novelty', 'features'],
    'Left a lab to "ship something real". Still reads papers at lunch. Ideas are strange and good.'],
  ['seller', 'The Seller', 'sales', 'mid', 'people_person', ['novelty', 'polish'],
    'Closed a deal at a wedding. Remembers every customer\'s dog\'s name.'],
];

export const ARCHETYPES = Object.fromEntries(rows.map(([id, name, role, seniority, trait, strengths, blurb]) => [
  id, { id, name, role, seniority, trait, strengths, blurb },
]));

export const DEFAULT_FOUNDERS = ['engineer', 'designer'];

const BUILDERS = new Set(['engineer', 'designer']);
for (const a of Object.values(ARCHETYPES)) {
  a.builder = BUILDERS.has(a.role);
  a.warning = a.builder ? null : 'Not a builder: works on products slowly, as a generalist.';
}

// A plain warning for a founder pair, or null when the pair can build normally.
export function foundingWarning(ids) {
  const pair = ids.map((id) => ARCHETYPES[id]).filter(Boolean);
  if (pair.some((a) => a.builder)) return null;
  return 'No builder: the first product will be slow. Plan to hire an engineer early.';
}
