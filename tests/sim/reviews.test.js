import { describe, it, expect } from 'vitest';
import { runBot } from '../../src/sim/bots.js';
import { REVIEW_QUOTES, AI_REVIEW_QUOTES } from '../../src/data/press.js';

const tagged = (when) => new Set([...Object.values(REVIEW_QUOTES), ...Object.values(AI_REVIEW_QUOTES)].flat().filter((q) => q.when === when).map((q) => q.text));

describe('issue #318: launch reviews', () => {
  it('over many seeded launches: distinct quotes, quotes that fit the version, and scores that average to the product score', () => {
    const firstOnly = tagged('first');
    const updateOnly = tagged('update');
    let launches = 0;
    let updates = 0;
    for (const [bot, seed] of [['balanced', 1], ['balanced', 2], ['sensible', 3], ['allHumans', 4], ['recklessHumans', 5]]) {
      runBot(bot, seed, 520, { onWeek: (s, ev) => {
        for (const e of ev) {
          if (e.type !== 'launch') continue;
          const p = s.products.find((x) => x.id === e.productId);
          if (!p?.reviews.length) continue;
          launches++;
          const quotes = p.reviews.map((r) => r.quote);
          expect(new Set(quotes).size, `${p.name} v${p.version}: ${quotes.join(' / ')}`).toBe(quotes.length);
          const mean = Math.round((p.reviews.reduce((a, r) => a + r.score, 0) / p.reviews.length) * 10) / 10;
          expect(p.score, `${p.name} v${p.version}`).toBe(mean);
          if (p.version > 1) {
            updates++;
            for (const q of quotes) expect(firstOnly.has(q), `${p.name} v${p.version}: ${q}`).toBe(false);
          } else {
            for (const q of quotes) expect(updateOnly.has(q), `${p.name} v1: ${q}`).toBe(false);
          }
        }
      } });
    }
    expect(launches).toBeGreaterThan(40);
    expect(updates).toBeGreaterThan(10);
  }, 120000);
});
