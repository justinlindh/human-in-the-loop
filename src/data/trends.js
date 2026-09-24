// AI-themed trends only appear once their subject exists.
const AI_ON = ['chatgbt', 'agents', 'consolidation', 'plateau'];
const AGENTS_ON = ['agents', 'consolidation', 'plateau'];

const rows = [
  ['agents_hot', 'Agents Are Hot', 'Every pitch deck now has the word "agentic" on slide one.', 26, { agent: 1.4, workflow: 1.2 }, {}, AGENTS_ON],
  ['ai_fatigue', 'AI Fatigue', 'Customers are tired of sparkle buttons. "Does it just work?" is back.', 26, { copilot: 0.7, native: 0.7 }, {}, AI_ON],
  ['compliance', 'Compliance Crackdown', 'Regulators discover AI. Everyone discovers lawyers.', 39, { agent: 0.8 }, { hr: 0.8, legal: 1.2, accounting: 1.1 }, AGENTS_ON],
  ['voice_boom', 'Voice Boom', 'Everyone is talking to their software. On the train. Loudly.', 26, { voice: 1.5 }, {}, ['consolidation']],
  ['budget_cuts', 'Budget Cuts', 'CFOs are cancelling seats. Nice-to-haves are now nice-to-not-haves.', 13, {}, { crm: 0.8, analytics: 0.85, pm: 0.85 }],
  ['remote_wave', 'Remote Wave', 'Nobody is in the office and everyone needs a summary of the meeting they skipped.', 26, { summarizer: 1.3 }, { notes: 1.2, pm: 1.2 }],
  ['security_scare', 'Security Scare', 'A big breach made the news. Every board is asking about security.', 26, {}, { security: 1.5, devtools: 1.1 }],
  ['creator_economy', 'Creator Economy', 'Everyone is a creator now. Everyone needs to edit video.', 26, { native: 1.2 }, { video: 1.4, design: 1.2 }],
  ['mobile_rush', 'Mobile Rush', 'Everything must be an app. Your dentist has an app. It has push notifications.', 26, { mobile: 1.4, onprem: 0.85 }, {}],
  ['api_economy', 'The API Economy', 'Developers are buying software with a credit card and a curl command.', 26, { api: 1.35 }, { devtools: 1.15 }],
  ['freemium_fever', 'Freemium Fever', 'Nobody pays for anything up front anymore. Some of them pay later.', 26, { freemium: 1.3 }, {}],
  ['cloud_shift', 'Everyone Moves to the Cloud', 'The server room is now a storage closet. The on-prem crowd is nervous.', 26, { onprem: 0.75, web: 1.15 }, {}],
  ['made_by_humans', 'Made by Humans', 'Customers want to know a person was involved. Some want to meet them.', 26, { web: 1.15, mobile: 1.1, native: 0.85, agent: 0.85 }, {}, ['plateau']],
  ['steady', 'Steady Market', 'The market is calm. Suspiciously calm.', 13, {}, {}],
];

// eras: optional list of eras the trend can appear in; otherwise AI-flavored trends skip the Classic era.
export const TRENDS = Object.fromEntries(rows.map(([id, name, text, weeks, angleMods, categoryMods, eras = null]) => [
  id, { id, name, text, weeks, angleMods, categoryMods, eras },
]));
