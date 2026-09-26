import { describe, it, expect } from 'vitest';
import { createGrowth, growthToast, timelineFrom } from './growth.js';

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

describe('timeline from saved history', () => {
  it('reads p.growth newest first, and falls back to the session log without it', () => {
    const p = { growth: [
      { week: 10, kind: 'level', detail: { level: 5, gains: { polish: 2 } } },
      { week: 20, kind: 'trained', detail: { skill: 'reliability', gain: 3, program: 'workshop' } },
      { week: 22, kind: 'trained', detail: { skill: null, gain: 0, program: 'conference' } },
      { week: 30, kind: 'promoted', detail: { seniority: 'senior' } },
      { week: 31, kind: 'trait', detail: { traitId: 'night_owl', source: 'record' } },
      { week: 40, kind: 'legend', detail: {} },
      { week: 41, kind: 'mystery', detail: {} },
    ] };
    const tl = timelineFrom(p);
    expect(tl.map((x) => x.text)).toEqual(['Became a legend', 'Earned Night Owl', 'Promoted to Senior', 'Finished a conference', 'Trained Reliability +3 (Workshop)', 'Level 5']);
    expect(tl[0]).toMatchObject({ week: 40, kind: 'legend' });
    expect(timelineFrom({ growth: [] })).toEqual([]);
    const log = [{ week: 3, kind: 'level', text: 'Level 2' }];
    expect(timelineFrom({}, log)).toBe(log);
  });

  it('shows every kind the sim records in a real game', async () => {
    const { createGame, tick } = await import('../sim/index.js');
    const bots = await import('../sim/bots.js');
    const s = createGame({ seed: 3, companyName: 'Loopworks' });
    for (let w = 0; w < 300 && !s.gameOver; w++) { bots.botDecide('balanced', s); bots.botTurn('balanced', s); tick(s); }
    const lines = s.staff.flatMap((p) => timelineFrom(p));
    expect(lines.length).toBeGreaterThan(0);
    for (const x of lines) expect(x.text).not.toMatch(/undefined|null|NaN/);
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
