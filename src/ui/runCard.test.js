import { describe, it, expect, vi } from 'vitest';

vi.mock('./eraPreview.js', () => ({ erasPreview: true }));
const { runCardData, cardFileName, pressLine } = await import('./runCard.js');
const { createGame } = await import('../sim/state.js');

const finish = (s, o = {}) => { s.gameOver = { won: true, reason: 'ipo', score: 1234.6, epilogue: [], ...o }; return s; };

describe('runCardData', () => {
  it('summarises a Classic run without an era share', () => {
    const s = finish(createGame({ seed: 3, companyName: 'Loopworks' }));
    s.week = 130; s.stats.peakMrr = 52000; s.stats.launches = 4; s.stats.hires = 9;
    const d = runCardData(s, { title: 'IPO day!', score: 1234.6 });
    expect(d).toMatchObject({ company: 'Loopworks', initial: 'L', route: 'Classic SaaS', years: 2, ending: 'IPO day!', score: 1235, share: null, won: true });
    expect(d.stats).toEqual([['Peak MRR', '$52K'], ['Launches', '4'], ['People hired', '9']]);
  });

  it('names the route and the start\'s share of Classic for an era start', () => {
    const s = finish(createGame({ seed: 3, companyName: 'Boxco', startEra: 'agents' }));
    const d = runCardData(s, { title: 'Acquired!', score: 10 });
    expect(d.route).toBe('Agents');
    expect(d.share).toBe(40);
  });

  it('calls the pre-internet start the long career', () => {
    const s = finish(createGame({ seed: 3, companyName: 'Boxco', startEra: 'preinternet' }));
    expect(runCardData(s, { title: 'x', score: 1 }).route).toBe('The Long Career');
  });
});

describe('pressLine', () => {
  const reviews = (...scores) => scores.map((score, i) => ({ outlet: `Outlet${i}`, score, quote: `quote ${score}` }));
  const state = { products: [
    { name: 'Notes', score: 8, reviews: reviews(7, 9, 8) },
    { name: 'Mail', score: 4, reviews: reviews(3, 5, 4) },
    { name: 'Ghost', score: 9, reviews: [] },
  ] };

  it('quotes the best review of the best product after a win', () => {
    expect(pressLine(state, true)).toEqual({ quote: 'quote 9', outlet: 'Outlet1', product: 'Notes' });
  });

  it('quotes the worst review of the weakest product after a loss', () => {
    expect(pressLine(state, false)).toEqual({ quote: 'quote 3', outlet: 'Outlet0', product: 'Mail' });
  });

  it('is empty when nothing was ever reviewed', () => {
    expect(pressLine({ products: [] }, true)).toBe(null);
    expect(pressLine({ products: [{ name: 'x', score: 5, reviews: [] }] }, false)).toBe(null);
  });
});

describe('cardFileName', () => {
  it('makes a safe file name from the company', () => {
    expect(cardFileName({ company: 'Loop & Works, Inc.' })).toBe('loop-works-inc-human-in-the-loop.png');
    expect(cardFileName({ company: '???' })).toBe('my-company-human-in-the-loop.png');
  });
});
