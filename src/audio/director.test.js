import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createDirector, voiceBank, bedSeconds } from './director.js';
import { BUSES, CUES, ON_EVENT, UI_CUES, MUSIC, GROUP_CUES, DUCK, PLAYLIST_MIN_S, PLAYLIST_PRELOAD_S, MOMENT_CUES } from './manifest.js';

const contract = readFileSync(new URL('../contract/contract.md', import.meta.url), 'utf8');
const eventTypes = () => {
  const out = new Set();
  const re = /#+ (SimEvent shapes|Events|Content ladder events|Speech vs (?:Yak|Slackk))[^\n]*\n([\s\S]*?)(?=\n#+ )/g;
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

  it('cheers a launch with up to four present people, staggered, under a cheer duck', () => {
    const d = createDirector();
    const cmds = d.events([{ type: 'launch', productId: 'p1' }], state(), 5);
    const barks = cmds.filter((c) => c.cue === 'voice.bark');
    expect(barks.length).toBe(GROUP_CUES.launch.maxVoices);
    expect(new Set(barks.map((b) => b.voiceKey)).size).toBe(GROUP_CUES.launch.maxVoices);
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

  it('never barks on speech bubbles or Yak lines', () => {
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

  it('plays a music night: one dance command with the genre track and a small cheer from the dancers after it', () => {
    const d = createDirector();
    const s = state();
    const cmds = d.events([{ type: 'incentive', staffId: 's1', reward: 'music_night', genre: 'motivational_polka', dancers: ['s2', 's3'] }], s, 10);
    const dance = cmds.find((c) => c.op === 'dance');
    expect(dance.file).toBe('musicNight/motivational_polka');
    expect(dance.duck).toBe('dance');
    expect(dance.at).toBeCloseTo(10.4);
    // The cheer is timed from the end of whatever buffer plays, so its offsets are small and positive.
    const barks = dance.after.filter((c) => c.cue === 'voice.bark');
    expect(barks.length).toBeGreaterThan(0);
    expect(barks.length).toBeLessThanOrEqual(3);
    for (const b of barks) { expect(['s1', 's2', 's3']).toContain(b.voiceKey); expect(b.at).toBeGreaterThan(0); expect(b.at).toBeLessThan(3); }
    expect(dance.after.some((c) => c.op === 'duck' && c.key === 'cheer' && !c.on)).toBe(true);
    // Nothing else plays alongside: no fixed-time duck release and no reward sting.
    expect(cmds.filter((c) => c.op !== 'dance')).toHaveLength(0);
    // An unknown genre still plays a track.
    expect(createDirector().events([{ type: 'incentive', reward: 'music_night', genre: 'yodel' }], s, 1).some((c) => c.op === 'dance')).toBe(true);
  });

  it('ducks the music under every stinger for the buffer, not a fixed time', () => {
    const d = createDirector();
    const s = state({ products: [{ id: 'p1', version: 1 }] });
    const evs = [{ type: 'launch', productId: 'p1' }, { type: 'era', era: 'agents' }, { type: 'officeUpgrade' }, { type: 'award' }];
    for (const [i, e] of evs.entries()) {
      const cmds = d.events([e], s, 100 + i * 10);
      const sting = cmds.find((c) => c.op === 'play' && (c.cue.startsWith('stinger.') || c.cue === 'sfx.award'));
      expect(sting?.duck, e.type).toBe('stinger');
      expect(cmds.some((c) => c.op === 'duck' && c.key === 'stinger'), e.type).toBe(false);
    }
    const over = d.events([{ type: 'gameOver' }], { ...s, gameOver: { won: true } }, 200).find((c) => c.cue === 'stinger.win');
    expect(over.duck).toBe('stinger');
    expect(DUCK.stinger.music).toBeCloseTo(0.25);
    expect(DUCK.stinger.attack).toBeCloseTo(0.3);
    expect(DUCK.stinger.release).toBeCloseTo(1);
  });

  it('pauses the dance track while the game is paused and resumes it after', () => {
    const d = createDirector();
    const s = state();
    d.update(s, 0, { speed: 1, running: true });
    const dp = (cmds) => cmds.find((c) => c.op === 'dancePause');
    expect(dp(d.update(s, 1, { speed: 1, running: true, menuPause: true })).paused).toBe(true);
    expect(dp(d.update(s, 2, { speed: 1, running: true, menuPause: true }))).toBeUndefined();
    expect(dp(d.update(s, 3, { speed: 1, running: true })).paused).toBe(false);
    expect(dp(d.update(s, 4, { speed: 0, running: false })).paused).toBe(true);
  });

  it('preloads the genre tracks once each time the genre pick appears', () => {
    // Only genre-track preloads count here; the playlist preloads its next bed on its own.
    const genre = (cmds) => cmds.find((c) => c.op === 'preload' && c.ids.some((id) => id.startsWith('musicNight/')));
    const d = createDirector();
    const s = state();
    expect(genre(d.update(s, 0, {}))).toBeUndefined();
    const pick = { ...s, pendingDecision: { id: 'music_night_genre', options: [{ id: 'sad_lofi' }, { id: 'motivational_polka' }] } };
    const pre = genre(d.update(pick, 1, { decision: true }));
    expect(pre.ids).toContain('musicNight/sad_lofi');
    expect(pre.ids).toHaveLength(4);
    expect(genre(d.update(pick, 2, { decision: true }))).toBeUndefined();
    // The next music night's pick loads them again, since the tracks are released after playing.
    expect(genre(d.update(s, 3, {}))).toBeUndefined();
    expect(genre(d.update(pick, 4, { decision: true }))).toBeDefined();
    // Other decisions do not.
    const other = createDirector();
    expect(genre(other.update({ ...s, pendingDecision: { id: 'layoffs', options: [{ id: 'yes' }] } }, 1, {}))).toBeUndefined();
  });

  it('spaces cheer voices apart, deals emotions without repeats, and alternates takes', () => {
    const d = createDirector({ seed: 3 });
    const s = state({ products: [{ id: 'p1', version: 1 }] });
    const barks = d.events([{ type: 'launch', productId: 'p1' }], s, 100).filter((c) => c.cue === 'voice.bark');
    expect(barks.length).toBe(GROUP_CUES.launch.maxVoices);
    expect(barks.length).toBeLessThanOrEqual(4);
    for (let i = 1; i < barks.length; i++) expect(barks[i].at - barks[i - 1].at).toBeGreaterThanOrEqual(GROUP_CUES.launch.stagger[0] - 1e-9);
    const n = GROUP_CUES.launch.emotions.length;
    // The first n voices use n different emotions.
    expect(new Set(barks.slice(0, n).map((b) => b.emotion)).size).toBe(n);
    // Voices sharing an emotion get consecutive take indexes, so a two-take bank alternates.
    const byEmotion = {};
    for (const b of barks) (byEmotion[b.emotion] ??= []).push(b.take);
    for (const takes of Object.values(byEmotion)) for (let i = 1; i < takes.length; i++) expect(takes[i] % 2).not.toBe(takes[i - 1] % 2);
  });

  it('plays the beds of an era as a playlist: switches on a loop boundary, never repeats one straight away', () => {
    const beds = { classic: ['classic/a', 'classic/b', 'classic/c'] };
    const d = createDirector({ seed: 5, beds });
    const s = state();
    const switches = [];
    let first = null;
    for (let t = 0; t <= 900; t += 0.25) {
      for (const c of d.update(s, t, { speed: 1, running: true })) {
        if (c.op !== 'music') continue;
        if (!first) first = c; else switches.push(c);
      }
    }
    expect(first.bed).toMatch(/^classic\//);
    expect(switches.length).toBeGreaterThan(2);
    let prev = first.bed;
    for (const c of switches) { expect(c.bed).not.toBe(prev); prev = c.bed; }
    // The first switch waits at least PLAYLIST_MIN_S and lands on a whole number of the first bed's loops.
    expect(switches[0].at).toBeGreaterThanOrEqual(PLAYLIST_MIN_S);
    expect(switches[0].fade).toBeGreaterThan(0);
    const loops = switches[0].at / bedSeconds('classic', first.bed);
    expect(Math.abs(loops - Math.round(loops))).toBeLessThan(1e-6);
  });

  it('does not count paused time toward the next bed, and keeps a single bed forever', () => {
    const d = createDirector({ seed: 5, beds: { classic: ['classic/a', 'classic/b'] } });
    const s = state();
    let switched = false;
    for (let t = 0; t <= 400; t += 0.25) {
      const cmds = d.update(s, t, { speed: 1, running: true, menuPause: t > 5 });
      if (t > 1 && cmds.some((c) => c.op === 'music')) switched = true;
    }
    expect(switched).toBe(false);
    const one = createDirector({ seed: 5, beds: { classic: ['classic/a'] } });
    let n = 0;
    for (let t = 0; t <= 900; t += 0.5) n += one.update(s, t, { speed: 1, running: true }).filter((c) => c.op === 'music').length;
    expect(n).toBe(1);
  });

  it('preloads the next bed shortly before its switch, and follows the real start of a late bed', () => {
    const d = createDirector({ seed: 9, beds: { classic: ['classic/a', 'classic/b'] } });
    const s = state();
    const startCmds = d.update(s, 0, { speed: 1, running: true });
    const first = startCmds.find((c) => c.op === 'music');
    // Nothing loads at the start: only the playing bed is held decoded.
    expect(startCmds.some((c) => c.op === 'preload')).toBe(false);
    // The host could only start the first bed 0.8 s late (its file was still decoding).
    d.musicStarted(first.bed, 0.8);
    let sw = null, pre = null, preAt = null;
    for (let t = 0.25; t <= 600 && !sw; t += 0.25) {
      const cmds = d.update(s, t, { speed: 1, running: true });
      const p = cmds.find((c) => c.op === 'preload');
      if (p) { expect(pre).toBeNull(); pre = p; preAt = t; }
      sw = cmds.find((c) => c.op === 'music') ?? null;
    }
    expect(pre.ids).toEqual([`music/${first.bed === 'classic/a' ? 'classic/b' : 'classic/a'}`]);
    expect(sw.bed).toBe(pre.ids[0].slice('music/'.length));
    // It loads about PLAYLIST_PRELOAD_S ahead, not a whole bed ahead.
    expect(sw.at - preAt).toBeGreaterThan(PLAYLIST_PRELOAD_S - 1);
    expect(sw.at - preAt).toBeLessThanOrEqual(PLAYLIST_PRELOAD_S + 0.5);
    const loops = (sw.at - 0.8) / bedSeconds('classic', first.bed);
    expect(Math.abs(loops - Math.round(loops))).toBeLessThan(1e-6);
  });

  it('preloads a moment cue while its decision is open, and starts and stops it on hitl:moment', () => {
    const d = createDirector();
    const s = state();
    const pick = { ...s, pendingDecision: { eventId: 'printer_jam', choices: [{}, {}] } };
    const pre = d.update(pick, 1, { decision: true }).filter((c) => c.op === 'preload' && c.ids.includes(MOMENT_CUES.printer_jam.file));
    expect(pre).toHaveLength(1);
    expect(d.update(pick, 2, { decision: true }).some((c) => c.op === 'preload' && c.ids.includes(MOMENT_CUES.printer_jam.file))).toBe(false);
    const start = d.moment({ phase: 'start', key: 'printer_jam', id: 'printer_jam-1' }, 5);
    expect(start).toEqual([expect.objectContaining({ op: 'moment', file: 'moments/printer_smash', id: 'printer_jam-1', at: 5, duck: 'dance' })]);
    expect(d.moment({ phase: 'end', key: 'printer_jam', id: 'printer_jam-1' }, 20)).toEqual([{ op: 'momentStop', id: 'printer_jam-1' }]);
    // Moments without a cue, and malformed details, do nothing.
    expect(d.moment({ phase: 'start', key: 'first_user_test', id: 'x' }, 5)).toEqual([]);
    expect(d.moment(null, 5)).toEqual([]);
  });

  it('cheers a quick post that lands and winces at one that backfires', () => {
    const d = createDirector();
    const s = state();
    const cues = (outcome) => d.events([{ type: 'posted', id: 'pizza', chatId: 'm1', outcome }], s, 10, {}).filter((c) => c.op === 'play').map((c) => c.cue);
    expect(ON_EVENT.posted({ outcome: 'landed' })).toBe('sfx.reward');
    expect(ON_EVENT.posted({ outcome: 'backfired' })).toBe('sfx.bad');
    expect(ON_EVENT.posted({ outcome: 'flat' })).toBeNull();
    expect(cues('landed')).toContain('sfx.reward');
  });
});
