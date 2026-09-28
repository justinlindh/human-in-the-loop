// Keys a decision `modifier` effect may target. goodWhen tells the UI which direction helps the player.
const rows = [
  ['output', 'Output', 'up', 'pct'],
  ['meaningRecovery', 'Meaning recovery', 'up', 'pct'],
  ['meaningDrain', 'Meaning drain', 'down', 'pct'],
  ['hype', 'Campaign hype', 'up', 'pct'],
  ['brandPerWeek', 'Brand per week', 'up', 'flat'],
  ['churn', 'Customer churn', 'down', 'pct'],
  ['acquisition', 'Customer acquisition', 'up', 'pct'],
  ['staminaDrain', 'Stamina drain', 'down', 'pct'],
  ['xp', 'Learning speed', 'up', 'pct'],
  ['oversight', 'Oversight hours', 'up', 'pct'],
  ['rogueRisk', 'Rogue agent risk', 'down', 'pct'],
  ['attrition', 'Outside offers taken', 'down', 'pct'],
];

export const MODIFIER_KEYS = Object.fromEntries(rows.map(([key, label, goodWhen, format]) => [key, { key, label, goodWhen, format }]));

// Output boosts that are really the team being pushed, keyed by modifier label, with how a postponed
// vacation's toast names them. Other boosts (a banner, open-plan buzz) never hold up a vacation.
export const VACATION_PUSHES = {
  'Founder hustle': 'the founder hustle',
  'Lockdown sprint': 'the lockdown sprint',
  Rivalry: 'the push to out-ship the rival',
  'Heads down': 'the heads-down push',
  'Family expectations': 'the push for big news',
  'Performance plan pressure': 'the performance plan',
};
