export const INCUMBENTS = [
  { id: 'notian', name: 'Notian', category: 'notes', strength: 420, wink: 'Notion' },
  { id: 'gmale', name: 'Gmale', category: 'email', strength: 600, wink: 'Gmail' },
  { id: 'jirra', name: 'Jirra', category: 'pm', strength: 480, wink: 'Jira' },
  { id: 'zendisk', name: 'Zendisk', category: 'support', strength: 360, wink: 'Zendesk' },
  { id: 'salesfarce', name: 'Salesfarce', category: 'crm', strength: 650, wink: 'Salesforce' },
  { id: 'lookerish', name: 'Lookerish', category: 'analytics', strength: 380, wink: 'Looker' },
  { id: 'figmo', name: 'Figmo', category: 'design', strength: 560, wink: 'Figma' },
  { id: 'githug', name: 'GitHug', category: 'devtools', strength: 620, wink: 'GitHub' },
  { id: 'workdai', name: 'Workdai', category: 'hr', strength: 520, wink: 'Workday' },
  { id: 'linkedout', name: 'LinkedOut', category: 'recruiting', strength: 540, wink: 'LinkedIn' },
  { id: 'quickbucks', name: 'Quickbucks', category: 'accounting', strength: 580, wink: 'QuickBooks' },
  { id: 'adobo', name: 'Adobo Premiere', category: 'video', strength: 500, wink: 'Adobe Premiere' },
  { id: 'lexisnaxis', name: 'LexisNaxis', category: 'legal', strength: 460, wink: 'LexisNexis' },
  { id: 'crowdstrife', name: 'CrowdStrife', category: 'security', strength: 600, wink: 'CrowdStrike' },
];

export const incumbentFor = (category) => INCUMBENTS.find((i) => i.category === category);
