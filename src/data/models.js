// Models exist from the ChatGBT moment on; each is released at the start of its releaseYear once that era has arrived.
// productCost: dollars per customer per month. autoCost: dollars per week for one function at automation level 1.
const rows = [
  ['claudius', 'Claudius', 'Claude', 80, 2.4, 1500, 0.9, 0.8, true, false, 2023, '#d97757',
    'Strong and careful. Will politely decline to delete prod, then explain why at length.'],
  ['chatgbt', 'ChatGBT', 'ChatGPT', 78, 2.0, 1300, 0.7, 0.9, true, false, 2022, '#10a37f',
    'The one your customers have heard of. Says "Great question!" a lot.'],
  ['gemenai', 'Gemenai', 'Gemini', 74, 1.3, 900, 0.65, 0.7, true, false, 2023, '#4b8bf5',
    'Reads your whole codebase in one go. Occasionally answers a different question.'],
  ['grokk', 'Grokk', 'Grok', 70, 1.0, 700, 0.25, 0.35, false, false, 2024, '#8a8a8a',
    'Cheap and fast. Has opinions about your customers and shares them.'],
  ['llamarama', 'Llamarama', 'Llama', 66, 0.6, 600, 0.45, 0.55, true, true, 2023, '#6b5bd6',
    'Open weights, your own GPUs. You own the guardrails and the electricity bill.'],
  ['deepsleep', 'DeepSleep', 'DeepSeek', 76, 0.5, 450, 0.5, 0.4, false, false, 2025, '#3a5ccc',
    'Shockingly good for the price. Your compliance officer has left the chat.'],
  ['mistrale', 'Mistrale', 'Mistral', 70, 1.2, 850, 0.6, 0.65, true, false, 2024, '#f5a524',
    'GDPR-compliant, well rested, and comes with a small baguette.'],
];

export const MODELS = Object.fromEntries(rows.map(([id, name, wink, capability, productCost, autoCost, guardrails, trust,
  complianceOk, selfHosted, releaseYear, color, blurb]) => [
  id, { id, name, wink, capability, productCost, autoCost, guardrails, trust, complianceOk, selfHosted, releaseYear, color, blurb },
]));
