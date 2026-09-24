// Internal tools, built as projects of kind 'research'. effect maps a bonus key to its value (see items.js).
// ai: only buildable from the Agents era on.
const rows = [
  ['eval_harness', 'Eval Harness', 'Test the agents before they test you. Rogue-agent incidents 25% less likely.', 400, null, { rogueRisk: -0.25 }],
  ['agent_sandbox', 'Agent Sandbox', 'Agents play in a box first. Rogue-agent damage 40% lower.', 500, 'eval_harness', { rogueDamage: -0.4 }],
  ['observability', 'Observability', 'Dashboards that actually explain things. Outages fixed 40% faster and rarely unfixable.', 500, null, { outageFix: 0.4, unrecoverableThreshold: -0.2 }],
  ['ci_cd', 'CI/CD Pipeline', 'Every change tested and shipped the same way. +10% reliability, slower health decay.', 450, null, { reliability: 0.1, healthDecay: -0.2 }],
  ['design_system', 'Design System', 'Shared components with opinions. +10% polish.', 350, null, { polish: 0.1 }],
  ['docs_culture', 'Docs Culture', 'People write things down. Departures cost 40% less debt; institutional knowledge +10%.', 400, null, { departureDebt: -0.4, ik: 0.1 }],
  ['onboarding_kit', 'Onboarding Kit', 'New hires start with a map. +15 starting knowledge.', 300, 'docs_culture', { newHireKnowledge: 15 }],
  ['red_team_suite', 'Red Team Suite', 'Attack yourself before someone else does. +10 security posture.', 600, null, { postureFlat: 10 }],
];

const AI_RESEARCH = new Set(['eval_harness', 'agent_sandbox']);

export const RESEARCH = Object.fromEntries(rows.map(([id, name, desc, points, requires, effect]) => [
  id, { id, name, desc, points, requires, effect, ai: AI_RESEARCH.has(id) },
]));
