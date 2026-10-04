import { describe, it, expect, vi } from 'vitest';

vi.mock('./eraPreview.js', () => ({ erasPreview: true }));
const { runCardData, cardFileName } = await import('./runCard.js');
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

describe('cardFileName', () => {
  it('makes a safe file name from the company', () => {
    expect(cardFileName({ company: 'Loop & Works, Inc.' })).toBe('loop-works-inc-human-in-the-loop.png');
    expect(cardFileName({ company: '???' })).toBe('my-company-human-in-the-loop.png');
  });
});
