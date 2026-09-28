import { describe, it, expect } from 'vitest';
import { productName, botProductName, CAT_WORD, SILLY } from '../../src/data/product-names.js';
import { B } from '../../src/sim/balance.js';
import { runBot } from '../../src/sim/bots.js';
import { createGame } from '../../src/sim/index.js';
import { FOR_SALE } from '../../src/data/forsale.js';
import { isAiText, isAgentText } from '../../src/sim/eras.js';
import { ERA_IDS } from '../../src/data/eras.js';

describe('product names (#1002)', () => {
  it('productName takes the category word when the roll says so, a silly name every fifth call, and stays under the cap', () => {
    expect(productName('notes', () => 0, 1)).toMatch(/^Note/);
    expect(SILLY).toContain(productName(null, () => 0, 5));
    for (let n = 1; n <= 200; n++) {
      const name = productName(Object.keys(CAT_WORD)[n % 14], (k) => (n * 7919) % k, n);
      expect(name.length).toBeGreaterThan(0);
      expect(name.length).toBeLessThanOrEqual(B.productNameMax);
    }
  });

  it('joke names wait for their era: nothing about AI in Classic, nothing about agents before Agents', () => {
    const all = (era) => {
      const out = new Set();
      for (let r = 0; r < 20; r++) out.add(productName(null, (k) => r % k, 5, era));
      return [...out];
    };
    expect(all('classic').length).toBeGreaterThanOrEqual(4);
    for (const name of all('classic')) expect(isAiText(name), name).toBe(false);
    expect(all('classic')).not.toContain('Summarize This');
    expect(all('chatgbt')).toContain('Yet Another Copilot');
    for (const name of all('chatgbt')) expect(isAgentText(name), name).toBe(false);
    expect(all('agents')).toContain('Agentic McAgentface');
    expect(ERA_IDS.every((era) => all(era).length > 0)).toBe(true);
  });

  it('botProductName is a pure function of the state: no rng draw, same answer twice', () => {
    const s = createGame({ seed: 11 });
    const rng = JSON.stringify(s.rng);
    const a = botProductName(s, 'notes');
    expect(botProductName(s, 'notes')).toBe(a);
    expect(JSON.stringify(s.rng)).toBe(rng);
    expect(a).not.toMatch(/^Product \d/);
    expect(a.length).toBeLessThanOrEqual(B.productNameMax);
  });

  it('botProductName never reuses a name already on a product or project', () => {
    const s = createGame({ seed: 3 });
    const seen = new Set();
    for (let i = 0; i < 60; i++) {
      const name = botProductName(s, 'email');
      expect(seen.has(name)).toBe(false);
      seen.add(name);
      s.products.push({ name });
      s.stats.launches++;
    }
  });

  it('botProductName never takes a for-sale company name, since the for-sale round skips names the company uses', () => {
    const forSale = new Set(FOR_SALE.map((c) => c.name));
    for (let seed = 1; seed <= 40; seed++) {
      const s = createGame({ seed });
      for (let i = 0; i < 40; i++) {
        const name = botProductName(s, 'accounting');
        expect(forSale.has(name)).toBe(false);
        s.products.push({ name });
        s.stats.launches++;
      }
    }
  });

  it('different seeds name their first products differently', () => {
    const firsts = new Set([1, 2, 3, 4, 5, 6].map((seed) => botProductName(createGame({ seed }), 'pm')));
    expect(firsts.size).toBeGreaterThan(3);
  });

  it('bot games name products with the generator, not placeholders', () => {
    const r = runBot('balanced', 4, 300);
    expect(r.state.products.length).toBeGreaterThan(0);
    for (const p of r.state.products) expect(p.name).not.toMatch(/^Product \d/);
  });
});
