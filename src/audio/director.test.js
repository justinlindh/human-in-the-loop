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

  it('muffles the music when the game is paused by speed 0, as for a menu', () => {
    const d = createDirector();
    const s = state();
    d.update(s, 0, { speed: 1, running: true });
    expect(d.musicState.lowpass).toBe(null);
    d.update(s, 1, { speed: 0, running: true });
    expect(d.musicState.lowpass).toBe(900);
    expect(d.musicState.level).toBe(0.5);
    d.update(s, 2, { speed: 1, running: true });
    expect(d.musicState.lowpass).toBe(null);
  });

  it('cheers only a new product, at most once per cooldown, even in a burst of launches', () => {
    const d = createDirector();
    const products = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, version: i % 3 === 0 ? 1 : 2 }));
    const s = state({ products });
    let cheers = 0, stingers = 0;
    for (let i = 0; i < 12; i++) {
      const cmds = d.events([{ type: 'launch', productId: `p${i}` }], s, 10 + i * 3, { speed: 1 });
      if (cmds.some((c) => c.op === 'duck' && c.key === 'cheer' && c.on)) cheers++;
      if (cmds.some((c) => c.cue === 'stinger.launch')) stingers++;
    }
    expect(stingers).toBe(4);   // p0, p3, p6, p9 are version 1; updates get a small chime instead
    expect(cheers).toBe(1);     // all within 36 s: the cooldown allows one
    // An update never cheers, even after the cooldown.
    const later = d.events([{ type: 'launch', productId: 'p1' }], s, 500, { speed: 1 });
    expect(later.some((c) => c.cue === 'voice.bark')).toBe(false);
    expect(d.events([{ type: 'launch', productId: 'p0' }], s, 500).some((c) => c.cue === 'voice.bark')).toBe(true);
  });

  it('does not cheer when a game starts or loads from the title', () => {
    const d = createDirector();
    const s = state();
    d.update(s, 0, { title: true });
    expect(d.musicState.era).toBe('title');
    const start = d.update(s, 1, { speed: 1, running: true });
    expect(start.find((c) => c.op === 'music')).toMatchObject({ era: 'classic' });
    expect(start.filter((c) => c.cue === 'voice.bark')).toHaveLength(0);
  });

  it('keeps single barks to VOICE.maxSingle at once', () => {
    const d = createDirector();
    const s = state();
    const out = ['s1', 's2', 's3', 's4'].flatMap((id) => d.poke(id, s, 1));
    expect(out.filter((c) => c.cue === 'voice.bark').length).toBe(2);
  });

  it('sends off a warm exit warmly and a burnout with a sigh', () => {
    const s = state();
    const play = (e) => createDirector().events([{ type: 'resign', staffId: 's2', ...e }], s, 5);
    for (const reason of ['moved_on', 'retired', 'poached']) {
      const c = play({ fired: false, reason });
      expect(c.find((x) => x.op === 'play' && x.bus === 'sfx')?.cue, reason).toBe('sfx.farewell');
      expect(c.find((x) => x.cue === 'voice.bark')?.emotion, reason).toBe('happy');
    }
    for (const e of [{ fired: false, reason: 'burnout' }, { fired: false }]) {
      const c = play(e);
      expect(c.find((x) => x.op === 'play' && x.bus === 'sfx')?.cue).toBe('sfx.resign');
      expect(c.find((x) => x.cue === 'voice.bark')?.emotion).toBe('sighing');
    }
    expect(play({ fired: true, reason: 'fired' }).filter((x) => x.op === 'play')).toHaveLength(0);
  });

  it('marks an outage starting and ending, and a door under hires and departures', () => {
    const d = createDirector();
    const s = state();
    d.update(s, 0, { speed: 1 });
    expect(d.update({ ...s, outage: { productId: 'p1' } }, 1, { speed: 1 }).some((c) => c.cue === 'sfx.outage')).toBe(true);
    expect(d.update(s, 20, { speed: 1 }).some((c) => c.cue === 'sfx.fixed')).toBe(true);
    expect(d.events([{ type: 'hire', staffId: 's1' }], s, 30).some((c) => c.cue === 'sfx.door')).toBe(true);
    expect(createDirector().events([{ type: 'resign', staffId: 's1', fired: true }], s, 30).some((c) => c.cue === 'sfx.door')).toBe(false);
  });

  it('plays pets and coffee rarely, only with a pet or a coffee machine', () => {
    const d = createDirector();
    const s = state({ pets: [{ id: 'pet1', species: 'dog', ownerId: 's1' }], office: { placed: [{ itemId: 'espresso' }] } });
    let dog = 0, coffee = 0;
    for (let t = 0; t < 600; t += 0.5) {
      const c = d.update(s, t, { speed: 1, running: true });
      dog += c.filter((x) => x.cue === 'sfx.dog').length;
      coffee += c.filter((x) => x.cue === 'sfx.coffee').length;
    }
    expect(dog).toBeGreaterThanOrEqual(2);
    expect(dog).toBeLessThanOrEqual(7);
    expect(coffee).toBeGreaterThanOrEqual(1);
    expect(coffee).toBeLessThanOrEqual(5);
    const bare = createDirector();
    let none = 0;
    for (let t = 0; t < 600; t += 0.5) none += bare.update(state(), t, { speed: 1, running: true }).filter((x) => x.cue === 'sfx.dog' || x.cue === 'sfx.coffee').length;
    expect(none).toBe(0);
  });

  it('keeps the typing bed quiet, scaled by who is working, and off when paused or in lockdown', () => {
    const d = createDirector();
    const working = state({ staff: staff(4).map((p) => ({ ...p, assignment: { type: 'project' } })) });
    const loop = (cmds) => cmds.find((c) => c.op === 'loop');
    expect(loop(d.update(working, 0, { speed: 1 })).gain).toBeGreaterThan(0);
    expect(loop(d.update(working, 1, { speed: 0 })).gain).toBe(0);
    expect(loop(d.update(working, 2, { speed: 1 })).gain).toBeGreaterThan(0);
    expect(loop(d.update({ ...working, lockdown: { until: 99 }, week: 10 }, 3, { speed: 1 })).gain).toBe(0);
    expect(createDirector({ quality: 'low' }).update(working, 0, { speed: 1 }).find((c) => c.op === 'loop')).toBeUndefined();
  });

  it('plays a perk sound when a prop is in use, rate-limited', () => {
    const d = createDirector();
    expect(d.prop('foosball', 1).some((c) => c.cue === 'sfx.foosball')).toBe(true);
    expect(d.prop('foosball', 5)).toHaveLength(0);
    expect(d.prop('desk', 50)).toHaveLength(0);
  });
});

