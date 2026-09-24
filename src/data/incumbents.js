export const INCUMBENTS = [
  { id: 'notian', name: 'Notian', category: 'notes', strength: 420 },
  { id: 'gmale', name: 'Gmale', category: 'email', strength: 600 },
  { id: 'jirra', name: 'Jirra', category: 'pm', strength: 480 },
  { id: 'zendisk', name: 'Zendisk', category: 'support', strength: 360 },
  { id: 'salesfarce', name: 'Salesfarce', category: 'crm', strength: 650 },
  { id: 'lookerish', name: 'Lookerish', category: 'analytics', strength: 380 },
  { id: 'figmo', name: 'Figmo', category: 'design', strength: 560 },
  { id: 'githug', name: 'GitHug', category: 'devtools', strength: 620 },
  { id: 'workdai', name: 'Workdai', category: 'hr', strength: 520 },
  { id: 'linkedout', name: 'LinkedOut', category: 'recruiting', strength: 540 },
  { id: 'quickbucks', name: 'Quickbucks', category: 'accounting', strength: 580 },
  { id: 'adobo', name: 'Adobo Premiere', category: 'video', strength: 500 },
  { id: 'lexisnaxis', name: 'LexisNaxis', category: 'legal', strength: 460 },
  { id: 'crowdstrife', name: 'CrowdStrife', category: 'security', strength: 600 },
];

export const incumbentFor = (category) => INCUMBENTS.find((i) => i.category === category);
