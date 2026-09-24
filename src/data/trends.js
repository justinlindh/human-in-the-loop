const rows = [
  ['agents_hot', 'Agents Are Hot', 'Every pitch deck now has the word "agentic" on slide one.', 26, { agent: 1.4, workflow: 1.2 }, {}],
  ['ai_fatigue', 'AI Fatigue', 'Customers are tired of sparkle buttons. "Does it just work?" is back.', 26, { copilot: 0.7, native: 0.7 }, {}],
  ['compliance', 'Compliance Crackdown', 'Regulators discover AI. Everyone discovers lawyers.', 39, { agent: 0.8 }, { hr: 0.8, legal: 1.2, accounting: 1.1 }],
  ['voice_boom', 'Voice Boom', 'Everyone is talking to their software. On the train. Loudly.', 26, { voice: 1.5 }, {}],
  ['budget_cuts', 'Budget Cuts', 'CFOs are cancelling seats. Nice-to-haves are now nice-to-not-haves.', 13, {}, { crm: 0.8, analytics: 0.85, pm: 0.85 }],
  ['remote_wave', 'Remote Wave', 'Nobody is in the office and everyone needs a summary of the meeting they skipped.', 26, { summarizer: 1.3 }, { notes: 1.2, pm: 1.2 }],
  ['security_scare', 'Security Scare', 'A big breach made the news. Every board is asking about security.', 26, {}, { security: 1.5, devtools: 1.1 }],
  ['creator_economy', 'Creator Economy', 'Everyone is a creator now. Everyone needs to edit video.', 26, { native: 1.2 }, { video: 1.4, design: 1.2 }],
  ['steady', 'Steady Market', 'The market is calm. Suspiciously calm.', 13, {}, {}],
];

export const TRENDS = Object.fromEntries(rows.map(([id, name, text, weeks, angleMods, categoryMods]) => [
  id, { id, name, text, weeks, angleMods, categoryMods },
]));
