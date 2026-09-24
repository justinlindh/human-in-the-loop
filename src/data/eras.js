// The world timeline. week is the nominal arrival (week 0 is January 2019); each run jitters it.
// changes: plain-words lines for the era card.
export const ERAS = [
  {
    id: 'classic', name: 'Classic SaaS', week: 0,
    blurb: 'Web apps, mobile apps, APIs, and a lot of pricing pages. Nobody has heard of a large language model.',
    changes: ['Build products from a category and an approach', 'Hire, launch, market, and grow the office'],
  },
  {
    id: 'chatgbt', name: 'The ChatGBT Moment', week: 195,
    blurb: 'A chatbot writes a sonnet about your churn rate and the whole industry loses its mind.',
    changes: ['Model vendors arrive', 'Copilot and Summarizer angles', 'Gentle automation for support and marketing, up to 50%', 'Incumbents start bolting AI onto everything'],
  },
  {
    id: 'agents', name: 'Agents', week: 325,
    blurb: 'The software now does the job instead of helping with it. Someone has to watch it do the job.',
    changes: ['Agent, Workflow, and AI-native angles', 'Full automation dials for engineering, QA, and ops', 'Rogue agents and oversight', 'AI research tools'],
  },
  {
    id: 'consolidation', name: 'Consolidation', week: 526,
    blurb: 'Everyone is buying everyone. The vendors change their prices, their models, and their minds.',
    changes: ['Price wars and frequent model deprecations', 'Incumbents fight back', 'Acquisition offers arrive more often'],
  },
];

export const ERA_IDS = ERAS.map((e) => e.id);
