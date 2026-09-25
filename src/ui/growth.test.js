import { describe, it, expect } from 'vitest';
import { createGrowth, growthToast } from './growth.js';

describe('growth', () => {
  it('keeps level-ups quiet, and writes one toast per person for a promotion, trait or trained skill', () => {
    const g = createGrowth();
    const [lv] = g.add([{ type: 'levelUp', staffId: 's1', level: 4, gains: { features: 2 } }], 10);
    expect(growthToast('Ada', lv, 'Engineer')).toBeNull();
    const [b] = g.add([{ type: 'levelUp', staffId: 's1', level: 12, gains: { polish: 3 } }, { type: 'promoted', staffId: 's1', seniority: 'senior' }, { type: 'traitEarned', staffId: 's1', traitId: 'night_owl' }], 11);
    expect(growthToast('Ada', b, 'Engineer')).toBe('Ada is now a Senior Engineer. Polish +3, earned Night Owl.');
    const [t] = g.add([{ type: 'skillTrained', staffId: 's2', skill: 'reliability', gain: 5 }], 12);
    expect(growthToast('Bo', t)).toBe('Bo grew. Reliability +5.');
  });

  it('remembers what grew until the card is opened, and keeps a short newest-first timeline', () => {
    const g = createGrowth();
    for (let l = 2; l <= 16; l++) g.add([{ type: 'levelUp', staffId: 's1', level: l, gains: { novelty: 1 } }], l);
    expect(g.hasUnseen('s1')).toBe(true);
    expect(g.unseen('s1').levels).toBe(15);
    expect(g.timeline('s1')).toHaveLength(12);
    expect(g.timeline('s1')[0].text).toBe('Level 16');
    g.markSeen('s1');
    expect(g.hasUnseen('s1')).toBe(false);
  });
});
