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
    expect(growthToast('Bo', t)).toBe('Bo finished training: Reliability +5.');
    const [lt] = g.add([{ type: 'levelUp', staffId: 's3', level: 7, gains: { polish: 2 } }, { type: 'traitEarned', staffId: 's3', traitId: 'night_owl' }], 13);
    expect(growthToast('Priya', lt)).toBe('Priya levelled up. Earned Night Owl.');
    const [tr] = g.add([{ type: 'traitEarned', staffId: 's4', traitId: 'night_owl' }], 14);
    expect(growthToast('Kai', tr)).toBe('Kai earned Night Owl.');
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

describe('growth toasts in a real game', () => {
  it('a promotion and an earned trait each end in exactly one toast', async () => {
    const { createGame, tick } = await import('../sim/index.js');
    const bots = await import('../sim/bots.js');
    const s = createGame({ seed: 1, companyName: 'Loopworks' });
    const g = createGrowth();
    const counted = { promoted: null, trait: null };
    for (let w = 0; w < 400 && !(counted.promoted && counted.trait) && !s.gameOver; w++) {
      const evs = [];
      bots.botDecide('balanced', s, { onEvents: (e) => evs.push(...e) });
      bots.botTurn('balanced', s, { onEvents: (e) => evs.push(...e) });
      evs.push(...tick(s));
      for (const b of g.add(evs.filter((e) => ['levelUp', 'promoted', 'traitEarned', 'skillTrained'].includes(e.type)), s.week)) {
        const p = s.staff.find((x) => x.id === b.staffId);
        if (!p) continue;
        const ui = growthToast(p.name, b) ? 1 : 0;
        const sim = evs.filter((e) => e.type === 'toast' && (e.text ?? '').startsWith(p.name) && /is now a (Mid|Senior)|earned|picked up|trait/i.test(e.text)).length;
        if (b.promoted && !counted.promoted) counted.promoted = ui + sim;
        if (b.traits.length && !b.promoted && !counted.trait) counted.trait = ui + sim;
      }
    }
    expect(counted.promoted).toBe(1);
    expect(counted.trait).toBe(1);
  });
});
