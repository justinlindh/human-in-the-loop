// Starting permissions are separate from earned milestones. Prices and kit sizes live in B.eraStarts.
const aiUnlocks = ['marketing', 'ops', 'research', 'models', 'automation', 'meaning', 'policy.pair'];
const tutorialGoals = ['place_desks', 'start_product', 'first_launch'];
export const ERA_STARTS = {
  web2: { id: 'web2', name: 'Web 2.0: The IE6 Years', blurb: 'Paying customers, company blogs and an approved browser that refuses to retire.', unlocks: ['marketing', 'ops', 'research'], skippedGoals: ['place_desks'] },
  dotcom: { id: 'dotcom', name: 'The Dot-com Boom', blurb: 'Websites, an IPO frenzy and a bust. Ship early and keep runway, then carry the company into Classic.', unlocks: ['marketing', 'ops', 'research', 'squads'], skippedGoals: ['place_desks', 'office_floor'] },
  classic: { id: 'classic', name: 'Classic SaaS', blurb: 'The full modern career. Build the company before the models arrive.', unlocks: [], skippedGoals: [] },
  chatgbt: { id: 'chatgbt', name: 'The ChatGBT Moment', blurb: 'Found a company as the chatbots arrive. Copilots, models and gentle automation are ready.', unlocks: aiUnlocks, skippedGoals: tutorialGoals },
  agents: { id: 'agents', name: 'Agents', blurb: 'Start on the Office Floor with autonomous tools available. Oversight is your job.', unlocks: [...aiUnlocks, 'squads'], skippedGoals: [...tutorialGoals, 'office_floor'] },
};

export const startEraId = (id) => Object.hasOwn(ERA_STARTS, id) ? id : 'classic';
