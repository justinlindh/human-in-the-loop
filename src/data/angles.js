const rows = [
  ['copilot', 'Copilot', 2026, false, 'Sits beside you and suggests things. Occasionally the right things.'],
  ['summarizer', 'Summarizer', 2026, false, 'Reads it so you do not have to. Nobody reads the summary either.'],
  ['workflow', 'Workflow Automation', 2026, true, 'If this, then that, then something nobody expected.'],
  ['agent', 'Autonomous Agent', 2027, true, 'Does the whole job unsupervised. That is the pitch and the problem.'],
  ['native', 'AI-native Rebuild', 2027, false, 'The old app, rebuilt from scratch around a chat box.'],
  ['voice', 'Voice-first', 2028, false, 'Talk to your software. It will talk back. At length.'],
  ['vertical', 'Vertical Fine-tune', 2029, false, 'A model that has read every tax code and none of the fun books.'],
];

export const ANGLES = Object.fromEntries(rows.map(([id, name, unlockYear, agentic, blurb]) => [
  id, { id, name, unlockYear, agentic, blurb },
]));
