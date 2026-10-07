import { describe, expect, it } from 'vitest';
import { adjacencyWords } from './buildmode.js';
import { CATALOG } from './v2content.js';
import { B } from '../sim/balance.js';

describe('the water cooler effect words', () => {
  it('says what the cooler does, with its number from the balance data', () => {
    const it = CATALOG.water_cooler;
    expect(it.adjacency.value).toBe(B.cooler.share);
    expect(it.costs[0]).toBe(B.cooler.price);
    const pct = Math.round(B.cooler.share * 100);
    expect(adjacencyWords({ gives: { key: 'knowledgeShare', value: B.cooler.share, to: 'desk', count: 3, radius: 3 } }))
      .toBe(`Weekly: 3 desks nearby close ${pct}% of the gap to the group's expert (2+ people)`);
    expect(adjacencyWords({ receives: [{ key: 'knowledgeShare', value: B.cooler.share }] }))
      .toBe(`This desk closes ${pct}% of the gap to the group's expert each week`);
  });

  it('keeps the cooler apart from the flat bonuses a desk also gets', () => {
    expect(adjacencyWords({ receives: [{ key: 'knowledgeShare', value: B.cooler.share }, { key: 'novelty', value: 0.04 }] }))
      .toBe(`This desk gets +4% freshness. This desk closes ${Math.round(B.cooler.share * 100)}% of the gap to the group's expert each week`);
  });
});
