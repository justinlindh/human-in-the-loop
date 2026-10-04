import { describe, it, expect } from 'vitest';
import { dealBeats } from './deals.js';

const state = { staff: [{ id: 's1', name: 'Dana Kim' }], products: [{ id: 'p1', name: 'Notes' }, { id: 'p2', name: 'Mail' }] };
const deal = (o) => ({ type: 'deal', productId: 'p1', customer: 'Initech', customers: 4, mrr: 400, week: 9, sellerId: 's1', first: false, notable: false, ...o });
const box = (o) => ({ type: 'deal', productId: 'p1', units: 100, revenue: 1000, week: 9, boxed: true, first: false, notable: false, ...o });

describe('dealBeats', () => {
  it('says nothing without deals', () => {
    expect(dealBeats([{ type: 'launch' }], state)).toEqual({ toasts: [], quiet: [] });
  });

  it('writes one quiet line for a small week', () => {
    const r = dealBeats([deal({ mrr: 200, customers: 2 })], state);
    expect(r.toasts).toEqual([]);
    expect(r.quiet).toEqual(['Sales: 2 new customers this week, +$200/mo.']);
  });

  it('toasts a week the sim marks notable and folds the rest, using the week total when given', () => {
    const r = dealBeats([deal({ mrr: 600, weekMrr: 1300 }), deal({ productId: 'p2', customer: 'Acme', mrr: 700, weekMrr: 1300, notable: true })], state);
    expect(r.quiet).toEqual([]);
    expect(r.toasts).toHaveLength(1);
    expect(r.toasts[0].text).toMatch(/^Dana closed Acme on Mail: \+\$700\/mo, \+1 more \(\$1,300\/mo in all\)/);
    expect(r.toasts[0].person.id).toBe('s1');
    expect(r.toasts[0].productId).toBe('p2');
  });

  it('always toasts a product\'s first deal, however small, and leads with it', () => {
    const r = dealBeats([deal({ mrr: 300, notable: true }), deal({ productId: 'p2', mrr: 50, first: true, notable: true, customer: 'Globex' })], state);
    expect(r.toasts[0].text).toContain('Dana closed Globex on Mail');
  });

  it('names the sales team when the seller left', () => {
    const r = dealBeats([deal({ sellerId: 'gone', first: true, notable: true })], state);
    expect(r.toasts[0].text.startsWith('The sales team closed Initech')).toBe(true);
    expect(r.toasts[0].person).toBe(null);
  });

  it('treats boxed sales on their own bar', () => {
    expect(dealBeats([box()], state).quiet[0]).toBe('Retail: 100 copies sold this week, $1,000 net.');
    const big = dealBeats([box({ revenue: 6000, units: 1, notable: true })], state);
    expect(big.toasts[0].text).toMatch(/^Retail moved 1 copy of Notes: /);
    expect(dealBeats([box({ first: true, notable: true })], state).toasts).toHaveLength(1);
  });

  it('keeps sales and boxed beats separate', () => {
    const r = dealBeats([deal({ first: true, notable: true }), box()], state);
    expect(r.toasts).toHaveLength(1);
    expect(r.quiet).toHaveLength(1);
  });
});
