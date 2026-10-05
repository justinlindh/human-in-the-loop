// Shared by period-content.test.js (the content pools) and period-content.full.test.js (seeded play).
import { expect } from 'vitest';

export const FUTURE = /\b(AI|agents?|agentic|ChatGBT|Claudius|Gemenai|LLMs?|copilot|Yak|Slack|Zoom|TikTok|Twitter|LinkedOut|GitHug|TechCrunchy|Vergence|Hackerspews|podcast|livestream|crypto|bitcoin|pull requests?|PRs?|smartphone|Product Hunch)\b/i;
export const safe = (text, context) => {
  expect(text, context).not.toMatch(FUTURE);
  expect(text, context).not.toMatch(/second copy\. On my phone/);
};
export const visibleStrings = (value) => {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === 'string' && ['text', 'title', 'label', 'hint', 'outcome'].includes(key)
      ? [child] : visibleStrings(child));
};
