// Approaches (ai false) exist from the start; AI angles arrive with their era and need a model.
// agentic: the product acts on its own and needs oversight.
const rows = [
  ['web', 'Web App', 'classic', false, false, 'A login page, a dashboard, and a settings screen nobody finds.'],
  ['mobile', 'Mobile-first', 'classic', false, false, 'Designed for thumbs. The desktop version is a sad afterthought.'],
  ['api', 'API-first', 'classic', false, false, 'The product is the docs. Developers love it; their managers need a demo.'],
  ['freemium', 'Freemium', 'classic', false, false, 'Free forever, until the free tier gets a little smaller every year.'],
  ['onprem', 'On-prem', 'classic', false, false, 'Ships on a disk to a server room. Enterprises feel safe. Upgrades take a quarter.'],
  ['copilot', 'Copilot', 'chatgbt', true, false, 'Sits beside you and suggests things. Occasionally the right things.'],
  ['summarizer', 'Summarizer', 'chatgbt', true, false, 'Reads it so you do not have to. Nobody reads the summary either.'],
  ['workflow', 'Workflow Automation', 'agents', true, true, 'If this, then that, then something nobody expected.'],
  ['agent', 'Autonomous Agent', 'agents', true, true, 'Does the whole job unsupervised. That is the pitch and the problem.'],
  ['native', 'AI-native Rebuild', 'agents', true, false, 'The old app, rebuilt from scratch around a chat box.'],
  ['voice', 'Voice-first', 'consolidation', true, false, 'Talk to your software. It will talk back. At length.'],
  ['vertical', 'Vertical Fine-tune', 'consolidation', true, false, 'A model that has read every tax code and none of the fun books.'],
];

export const ANGLES = Object.fromEntries(rows.map(([id, name, era, ai, agentic, blurb]) => [
  id, { id, name, era, ai, agentic, blurb },
]));
