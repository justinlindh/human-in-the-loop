import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createDirector, voiceBank } from './director.js';
import { BUSES, CUES, ON_EVENT, UI_CUES, MUSIC, GROUP_CUES, DUCK } from './manifest.js';

const contract = readFileSync(new URL('../contract/contract.md', import.meta.url), 'utf8');
const eventTypes = () => {
  const out = new Set();
  const re = /#+ (SimEvent shapes|Events|Content ladder events|Speech vs Slackk)[^\n]*\n([\s\S]*?)(?=\n#+ )/g;
  for (const m of contract.matchAll(re)) for (const t of m[2].matchAll(/type: '([a-zA-Z]+)'/g)) out.add(t[1]);
  return [...out];
};

const staff = (n) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, mood: 'ok', meaning: 70, stamina: 80, strain: 0, voice: { set: i % 2 ? 'masc' : 'fem', variant: i } }));
const state = (extra = {}) => ({ week: 10, era: { id: 'classic' }, staff: staff(8), ...extra });

describe('audio manifest', () => {
  it('lists every contract event type in ON_EVENT', () => {
    const types = eventTypes();
    expect(types.length).toBeGreaterThan(10);
    for (const t of types) expect(ON_EVENT, t).toHaveProperty(t);
  });
  it('points every cue at a real bus and every UI cue at a real cue', () => {
    for (const [id, c] of Object.entries(CUES)) {
      expect(BUSES, id).toHaveProperty(c.bus);
      expect(c.files.length, id).toBeGreaterThan(0);
      if (c.duck) expect(DUCK, id).toHaveProperty(c.duck);
    }
    for (const id of Object.values(UI_CUES)) expect(CUES, id).toHaveProperty(id);
    for (const r of Object.values(ON_EVENT)) if (typeof r === 'string') expect(CUES, r).toHaveProperty(r);
    for (const g of Object.values(GROUP_CUES)) expect(DUCK).toHaveProperty(g.duck);
    for (const era of ['classic', 'chatgbt', 'agents', 'consolidation', 'plateau', 'title']) expect(MUSIC).toHaveProperty(era);
  });
});

describe('audio director', () => {
  it('is deterministic for a fixed input', () => {
    const run = () => {
      const d = createDirector({ seed: 3 });
      const s = state();
      return [...d.update(s, 0, {}), ...d.events([{ type: 'launch', productId: 'p1' }, { type: 'hire', staffId: 's2' }], s, 1), ...d.poke('s3', s, 2)];
    };
    expect(run()).toEqual(run());
  });

  it('plays a burst of the same event once per batch and honours cooldowns', () => {
    const d = createDirector();
    const s = state();
    const burst = Array.from({ length: 10 }, () => ({ type: 'bubble', staffId: 's1' }));
    const a = d.events(burst, s, 1).filter((c) => c.cue === 'sfx.bubble');
    const b = d.events(burst, s, 1.05).filter((c) => c.cue === 'sfx.bubble');
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(0);
  });

  it('keeps each bus within its voice limit', () => {
    const d = createDirector();
    const s = state();
    let sfx = 0;
    for (let i = 0; i < 20; i++) sfx += d.events([{ type: 'incident', caught: true }, { type: 'award', text: 'x' }, { type: 'toast', tone: 'bad', text: `b${i}` }], s, 1 + i * 0.001).filter((c) => c.op === 'play' && c.bus === 'sfx').length;
    expect(sfx).toBeLessThanOrEqual(BUSES.sfx.limit);
  });

  it('cheers a launch with up to six present people, staggered, under a cheer duck', () => {
    const d = createDirector();
    const cmds = d.events([{ type: 'launch', productId: 'p1' }], state(), 5);
    const barks = cmds.filter((c) => c.cue === 'voice.bark');
    expect(barks.length).toBe(6);
    expect(new Set(barks.map((b) => b.voiceKey)).size).toBe(6);
    for (let i = 1; i < barks.length; i++) expect(barks[i].at).toBeGreaterThan(barks[i - 1].at);
    expect(cmds.some((c) => c.op === 'duck' && c.key === 'cheer' && c.on)).toBe(true);
    const low = createDirector({ quality: 'low' }).events([{ type: 'launch' }], state(), 5).filter((c) => c.cue === 'voice.bark');
    expect(low.length).toBe(2);
  });

  it('barks on a click with the person\'s own bank, once per cooldown', () => {
    const d = createDirector();
    const s = state();
    const first = d.poke('s3', s, 1);
    expect(first).toHaveLength(1);
    expect(first[0].file).toBe(`voice/${voiceBank(s.staff[3])}`);
    expect(d.poke('s3', s, 1.2)).toHaveLength(0);
    expect(d.poke('s3', s, 3)).toHaveLength(1);
    const tired = createDirector().poke('s1', { staff: [{ ...s.staff[1], strain: 80 }] }, 0)[0];
    expect(['tired', 'sighing']).toContain(tired.emotion);
  });

  it('starts the era bed, waits for the era card before crossfading, and drops music under a pause', () => {
    const d = createDirector();
    const s = state();
    const first = d.update(s, 0, {});
    expect(first.find((c) => c.op === 'music')).toMatchObject({ era: 'classic' });
    const s2 = state({ era: { id: 'chatgbt' } });
    d.events([{ type: 'era', eraId: 'chatgbt' }], s2, 10);
    expect(d.update(s2, 10.1, { menuPause: true }).find((c) => c.op === 'music')).toBeUndefined();
    const paused = d.update(s2, 10.2, { menuPause: true }).concat(d.update(s2, 10.1, { menuPause: true }));
    expect(d.musicState.lowpass).toBe(900);
    const after = d.update(s2, 12, {});
    expect(after.find((c) => c.op === 'music')).toMatchObject({ era: 'chatgbt' });
    expect(d.musicState.lowpass).toBe(null);
    expect(paused).toBeDefined();
  });

  it('keeps ambient barks rare: at most one per 30 s of play', () => {
    const d = createDirector();
    const s = state();
    let barks = 0;
    for (let t = 0; t < 600; t += 0.1) barks += d.update(s, t, { speed: 1, running: true }).filter((c) => c.cue === 'voice.bark').length;
    expect(barks).toBeGreaterThan(5);
    expect(barks).toBeLessThanOrEqual(20);
  });

  it('never barks on speech bubbles or Slackk lines', () => {
    const d = createDirector();
    const cmds = d.events([{ type: 'say', staffId: 's1', text: 'hi' }, { type: 'chat', from: 'x', text: 'y' }], state(), 1);
    expect(cmds.filter((c) => c.cue === 'voice.bark')).toHaveLength(0);
  });
});
