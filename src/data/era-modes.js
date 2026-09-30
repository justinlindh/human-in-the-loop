// Starting permissions are separate from earned milestones. Prices and kit sizes live in B.eraStarts.
const aiUnlocks = ['marketing', 'ops', 'research', 'models', 'automation', 'meaning', 'policy.pair'];
const tutorialGoals = ['place_desks', 'start_product', 'first_launch'];
export const ERA_STARTS = {
  dotcom: { id: 'dotcom', name: 'The Dot-com Boom', blurb: 'Websites, an IPO frenzy and a bust. Ship early and keep runway, then carry the company into Classic.', unlocks: ['marketing', 'ops', 'research', 'squads'], skippedGoals: ['place_desks'] },
  classic: { id: 'classic', name: 'Classic SaaS', blurb: 'The full modern career. Build the company before the models arrive.', unlocks: [], skippedGoals: [] },
  chatgbt: { id: 'chatgbt', name: 'The ChatGBT Moment', blurb: 'Found a company as the chatbots arrive. Copilots, models and gentle automation are ready.', unlocks: aiUnlocks, skippedGoals: tutorialGoals },
  agents: { id: 'agents', name: 'Agents', blurb: 'A garage with full automation and milder incidents for the first five company years. Grow your team here.', unlocks: [...aiUnlocks, 'squads'], skippedGoals: tutorialGoals },
};

export const startEraId = (id) => Object.hasOwn(ERA_STARTS, id) ? id : 'classic';
