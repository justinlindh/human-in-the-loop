// The pure audio director: sim events, UI cues, clicks and state in; a list of commands out.
// No DOM, no WebAudio, no Math.random: variation comes from its own seeded rng, so a fixed input
// gives the same commands (and it runs headless in Node).
//
// Commands:
//   { op: 'play', cue, file, bus, gain, at, priority, voiceKey?, duck? }  duck: hold it while the buffer plays
//   { op: 'music', era, bed, at, fade }              crossfade to a bed at time `at`
//   { op: 'musicMix', level, lowpass, fade }         music level and filter
//   { op: 'duck', key, on }                          hold or release a music duck
//   { op: 'dance', file, gain, at, duck, expect, after }  a music night track (see musicNight)
//   { op: 'dancePause', paused }                   stop or resume the dance track and its cheer
//   { op: 'preload', ids }                         start loading assets that will be needed soon
//   { op: 'stopAll', bus }

import { ASSETS } from './loader.js';
import { BUSES, CUES, ON_EVENT, UI_CUES, MUSIC, CROSSFADE_BARS, PAUSE_LOWPASS, PAUSE_GAIN, MOOD,
  VOICE_VARIANTS, VOICE, GROUP_CUES, isFirstLaunch, resignReason, isWarmExit, WORLD, PROP_CUES,
  MUSIC_NIGHT, MUSIC_NIGHT_SECONDS, isMusicNightDecision } from './manifest.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function voiceBank(person) {
  const v = person?.voice;
  const set = v?.set === 'masc' ? 'masc' : 'fem';
  // The delivered cast (assets.json voiceVariants) wins over the placeholder list.
  const list = ASSETS.voiceVariants?.[set]?.length ? ASSETS.voiceVariants[set] : VOICE_VARIANTS[set];
  const i = Number.isFinite(v?.variant) ? Math.abs(Math.floor(v.variant)) % list.length : 0;
  return `${set}_${list[i]}`;
}

// A person's emotion for a poke or an ambient bark, from their state.
export function moodEmotion(p, rng) {
  if (p.mood === 'burnout' || (p.strain ?? 0) >= 60 || (p.stamina ?? 100) < 25) return rng() < 0.5 ? 'tired' : 'sighing';
  if ((p.meaning ?? 100) < 35 || p.mood === 'coasting') return 'annoyed';
  return rng() < 0.6 ? 'happy' : 'questioning';
}

const present = (s) => (s?.staff ?? []).filter((p) => p.mood !== 'away' && !p.remote);

export function createDirector({ seed = 1, quality = 'high' } = {}) {
  const rng = mulberry32(seed);
  let q = quality;
  const lastCue = new Map();      // cue id -> t
  const lastPoke = new Map();     // staffId -> t
  const lastVoiceMoment = { t: -1e9 };
  let lastCheer = -1e9;
  let speedNow = 1;
  let nextAmbient = null;
  let playing = [];               // { bus, priority, until, t }
  const moods = new Map();        // staffId -> last mood
  let hadOutage = null;
  let nextPet = null, nextCoffee = null;
  let typing = 0;
  const music = { era: null, bed: null, pendingEra: null, level: null, lowpass: undefined, paused: null, title: null, dancePaused: false, preloaded: false };

  const pick = (arr) => arr[Math.floor(rng() * arr.length) % arr.length];
  const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const k = Math.floor(rng() * (i + 1)); [arr[i], arr[k]] = [arr[k], arr[i]]; } return arr; };

  // Voice allocation: a full bus accepts a new cue only by stealing a lower-priority voice.
  function admit(bus, priority, t, dur) {
    playing = playing.filter((v) => v.until > t);
    const limit = q === 'low' && bus === 'sfx' ? 3 : BUSES[bus]?.limit ?? 4;
    const onBus = playing.filter((v) => v.bus === bus);
    if (onBus.length >= limit) {
      const victim = onBus.filter((v) => v.priority < priority).sort((a, b) => a.priority - b.priority || a.t - b.t)[0];
      if (!victim) return false;
      playing = playing.filter((v) => v !== victim);
    }
    playing.push({ bus, priority, until: t + dur, t });
    return true;
  }

  function playCue(id, t, { speed = 1, gain = 1 } = {}) {
    const c = CUES[id];
    if (!c) return [];
    if (q === 'low' && c.priority <= 1) return [];
    if (speed >= 4 && c.priority <= 1) return [];
    const cd = (c.cooldown ?? 0.05) * (c.scaleWithSpeed ? Math.max(1, speed) : 1);
    if (t - (lastCue.get(id) ?? -1e9) < cd) return [];
    if (!admit(c.bus, c.priority ?? 5, t, 1.2)) return [];
    lastCue.set(id, t);
    const j = c.jitter?.gain ? 1 - c.jitter.gain * rng() : 1;
    // A ducking cue carries its duck key; the host holds it for the buffer's actual length.
    const cmd = { op: 'play', cue: id, file: pick(c.files), bus: c.bus, gain: gain * j * (c.gain ?? 1), at: t, priority: c.priority ?? 5 };
    if (c.duck) cmd.duck = c.duck;
    return [cmd];
  }

  function bark(person, emotion, t, { gain = 1, priority = 7, key = 'voice', take = null } = {}) {
    if (!person) return [];
    // Single barks (not a cheer) never stack beyond VOICE.maxSingle at once.
    if (key === 'voice' && playing.filter((v) => v.bus === 'voice' && v.single && v.until > t).length >= VOICE.maxSingle) return [];
    if (!admit('voice', priority, t, 1.5)) return [];
    if (key === 'voice') playing[playing.length - 1].single = true;
    return [{ op: 'play', cue: 'voice.bark', file: `voice/${voiceBank(person)}`, emotion, bus: 'voice', gain, at: t, priority, voiceKey: person.id, duckKey: key, ...(take === null ? {} : { take }) }];
  }

  // A group cheer: several present people, staggered, quieter each, over a crowd bed.
  function cheer(kind, s, t, leadId = null, { force = false } = {}) {
    const g = GROUP_CUES[kind];
    if (!g) return [];
    // Cheers are rare: at most one per cooldown of real time, longer at higher game speed.
    if (!force && t - lastCheer < VOICE.cheerCooldown * Math.max(1, speedNow)) return [];
    const here = present(s);
    if (!here.length) return [];
    const n = Math.min(q === 'low' ? g.lowMaxVoices : g.maxVoices, here.length);
    const lead = here.find((p) => p.id === leadId);
    const rest = here.filter((p) => p !== lead);
    for (let i = rest.length - 1; i > 0; i--) { const k = Math.floor(rng() * (i + 1)); [rest[i], rest[k]] = [rest[k], rest[i]]; }
    const who = (lead ? [lead, ...rest] : rest).slice(0, n);
    const base = g.groupGain;
    const deck = [...g.emotions];
    const takeBase = Math.floor(rng() * 8);
    const out = [{ op: 'duck', key: g.duck, on: true, at: t }];
    let at = t;
    who.forEach((p, i) => {
      if (i > 0) at += g.stagger[0] + rng() * (g.stagger[1] - g.stagger[0]);
      const [lo, hi] = g.gainSpreadDb;
      const spread = 10 ** ((lo + rng() * (hi - lo)) / 20);
      // Emotions are dealt from a shuffled deck, and voices sharing an emotion take turns on its takes.
      if (i % deck.length === 0) shuffle(deck);
      const emotion = deck[i % deck.length];
      out.push(...bark(p, emotion, at, { gain: base * spread, priority: 8, key: 'cheer', take: takeBase + Math.floor(i / deck.length) }));
    });
    if (g.crowdBed > 0) out.push({ op: 'play', cue: 'voice.crowd', file: 'voice/crowd', bus: 'ambience', gain: g.crowdBed, at: t, priority: 4 });
    out.push({ op: 'duck', key: g.duck, on: false, at: at + 1.5 });
    lastVoiceMoment.t = at;
    lastCheer = t;
    return out;
  }

  // A dance break: one 'dance' command. The host holds the dance duck from now, starts the genre's
  // track (waiting briefly for the real file), releases the duck when the buffer actually ends, and
  // then plays `after` (a small cheer from the dancers) with each `at` measured from that end.
  function musicNight(e, s, t) {
    const genre = MUSIC_NIGHT[e.genre] ? e.genre : 'corporate_synthwave';
    const len = ASSETS.musicNight?.[genre]?.duration ?? MUSIC_NIGHT_SECONDS;
    const end = t + 0.4 + len;
    const dancers = new Set([e.staffId, ...(e.dancers ?? [])].filter(Boolean));
    const crowd = dancers.size ? { ...s, staff: (s?.staff ?? []).filter((p) => dancers.has(p.id)) } : s;
    const after = cheer('musicNight', crowd, end + 0.2, e.staffId, { force: true }).map((c) => ({ ...c, at: c.at - end }));
    return [{ op: 'dance', cue: 'music.night', genre, file: `musicNight/${genre}`, bus: 'sfx', gain: 0.75, at: t + 0.4, duck: 'dance', expect: len, after }];
  }

  const voiceMomentOk = (t) => t - lastVoiceMoment.t >= VOICE.globalGap;

  return {
    setQuality(v) { q = v === 'low' ? 'low' : 'high'; },

    // Sim events at real time t. Same-cue events in one batch play once.
    events(events, state, t, { speed = 1 } = {}) {
      speedNow = speed;
      const out = [];
      const seen = new Set();
      for (const e of events ?? []) {
        const rule = ON_EVENT[e.type];
        const id = typeof rule === 'function' ? rule(e, state) : rule;
        if (id && !seen.has(id)) { seen.add(id); out.push(...playCue(id, t, { speed })); }
        // A door under arrivals and departures.
        if ((e.type === 'hire' || (e.type === 'resign' && !e.fired)) && !seen.has('sfx.door')) { seen.add('sfx.door'); out.push(...playCue('sfx.door', t + 0.1, { speed })); }
        // Voice moments.
        if (e.type === 'launch') { if (isFirstLaunch(e, state)) out.push(...cheer('launch', state, t + 0.15)); }
        else if (e.type === 'incentive' && e.reward === 'waffle_party') out.push(...cheer('waffleParty', state, t + 0.2, e.staffId));
        else if (e.type === 'incentive' && e.reward === 'music_night') out.push(...musicNight(e, state, t));
        else if (e.type === 'era') music.pendingEra = e.eraId;
        else if (voiceMomentOk(t)) {
          const who = (id2) => state?.staff?.find((p) => p.id === id2);
          if (e.type === 'incident' && !e.caught) {
            const here = present(state);
            if (here.length) { out.push(...bark(pick(here), rng() < 0.5 ? 'annoyed' : 'sighing', t + 0.3)); lastVoiceMoment.t = t; }
          } else if (e.type === 'resign' && resignReason(e) !== 'fired') {
            // A burnout leaves with a sigh; a warm exit with a happy goodbye.
            const p = who(e.staffId) ?? { id: e.staffId, voice: e.voice };
            out.push(...bark(p, isWarmExit(e) ? 'happy' : 'sighing', t + 0.2)); lastVoiceMoment.t = t;
          } else if (e.type === 'hire') {
            out.push(...bark(who(e.staffId), 'happy', t + 0.4)); lastVoiceMoment.t = t;
          }
        }
      }
      return out;
    },

    // A UI 'hitl:sfx' name.
    cue(name, t) { return playCue(UI_CUES[name] ?? name, t); },

    // The renderer staged someone using a perk prop.
    prop(itemId, t) { return PROP_CUES[itemId] ? playCue(PROP_CUES[itemId], t) : []; },

    // The player clicked a person.
    poke(staffId, state, t) {
      const p = state?.staff?.find((x) => x.id === staffId);
      if (!p || t - (lastPoke.get(staffId) ?? -1e9) < VOICE.pokeCooldown) return [];
      lastPoke.set(staffId, t);
      lastVoiceMoment.t = t;
      return bark(p, moodEmotion(p, rng), t, { priority: 9 });
    },

    // Every frame: music state machine, pause filter, burnout barks, ambient barks.
    update(state, t, ctx = {}) {
      const out = [];
      if (Number.isFinite(ctx.speed)) speedNow = Math.max(1, ctx.speed);
      const hold = !!(ctx.menuPause || ctx.decision);
      // Music: title bed on the title screen, else the era's bed. An era change waits for its card.
      const want = ctx.title ? 'title' : (music.pendingEra && hold ? music.era : state?.era?.id ?? 'classic');
      if (!hold && music.pendingEra && !ctx.title) music.pendingEra = null;
      if (want && want !== music.era && MUSIC[want]) {
        const m = MUSIC[want];
        const barLen = (60 / m.bpm) * 4;
        const bed = m.beds[Math.floor(rng() * m.beds.length) % m.beds.length];
        const first = music.era === null;
        const fromTitle = music.era === 'title';
        music.era = want; music.bed = bed;
        out.push({ op: 'music', era: want, bed, at: t, fade: first ? 1.5 : CROSSFADE_BARS * barLen });
        // Only a real era arrival cheers: not the first bed, and not starting or loading from the title.
        if (want !== 'title' && !first && !fromTitle && voiceMomentOk(t)) out.push(...cheer('era', state, t + CROSSFADE_BARS * barLen));
      }
      // Level and filter: paused holds get a lowpass and -6 dB; otherwise the state's mood rule.
      const rule = MOOD.find((r) => r.when(state ?? {}))?.music ?? { level: 1, lowpass: null };
      // Stopped: the host says so, or the speed is 0 (the Pause button, or an auto-pause on blur).
      const stopped = (ctx.running === false || ctx.speed === 0) && !ctx.title;
      const level = ctx.over ? 0.8 : hold || stopped ? rule.level * PAUSE_GAIN : rule.level;
      const lowpass = hold || stopped ? PAUSE_LOWPASS : rule.lowpass;
      if (level !== music.level || lowpass !== music.lowpass) {
        music.level = level; music.lowpass = lowpass;
        out.push({ op: 'musicMix', level, lowpass, fade: 0.4 });
      }
      // A paused game pauses the dance track (and the dancers' cheer waits with it).
      const dp = !!(hold || stopped);
      if (dp !== music.dancePaused) { music.dancePaused = dp; out.push({ op: 'dancePause', paused: dp }); }
      // The genre pick for a music night: start loading the tracks so the real one plays.
      if (!music.preloaded && isMusicNightDecision(state?.pendingDecision)) {
        music.preloaded = true;
        out.push({ op: 'preload', ids: Object.keys(MUSIC_NIGHT).map((g) => `musicNight/${g}`) });
      }
      // The typing bed: quiet, scaled by how many people are at their desks working; off while
      // paused, in lockdown, on the title, and on Low.
      const working = (state?.staff ?? []).filter((p) => p.mood !== 'away' && !p.remote && ['project', 'maintenance', 'support', 'security', 'sales', 'marketing'].includes(p.assignment?.type)).length;
      const total = Math.max(1, (state?.staff ?? []).length);
      const tg = q === 'low' || ctx.title || hold || stopped || state?.lockdown && state.week < (state.lockdown.until ?? Infinity) ? 0 : Math.round((WORLD.typingMax * Math.min(1, working / total)) * 20) / 20;
      if (tg !== typing) { typing = tg; out.push({ op: 'loop', id: 'ambience/typing', bus: 'ambience', gain: tg, fade: 1.5 }); }
      if (!state?.staff || ctx.title) return out;
      // Outage start and end.
      const outage = !!state.outage;
      if (hadOutage !== null && outage !== hadOutage) out.push(...playCue(outage ? 'sfx.outage' : 'sfx.fixed', t));
      hadOutage = outage;
      // Burnout: once per episode, from last week's moods.
      for (const p of state.staff) {
        const before = moods.get(p.id);
        if (before && before !== 'burnout' && p.mood === 'burnout' && voiceMomentOk(t)) {
          out.push(...bark(p, 'tired', t)); lastVoiceMoment.t = t;
        }
        moods.set(p.id, p.mood);
      }
      // Ambient: rare, only while time runs and nothing holds the screen.
      const running = ctx.running !== false && (ctx.speed ?? 1) > 0 && !hold && !(state.lockdown && state.week < (state.lockdown.until ?? Infinity));
      if (nextPet === null) { nextPet = t + WORLD.petMinGap + rng() * WORLD.petSpread; nextCoffee = t + WORLD.coffeeMinGap + rng() * WORLD.coffeeSpread; }
      if (running && t >= nextPet) {
        nextPet = t + WORLD.petMinGap + rng() * WORLD.petSpread;
        const here = new Set(present(state).map((p) => p.id));
        const pets = (state.pets ?? []).filter((p) => p.ownerId == null || here.has(p.ownerId));
        if (pets.length) out.push(...playCue(pick(pets).species === 'cat' ? 'sfx.cat' : 'sfx.dog', t));
      }
      if (running && t >= nextCoffee) {
        nextCoffee = t + WORLD.coffeeMinGap + rng() * WORLD.coffeeSpread;
        const hasCoffee = (state.office?.placed ?? []).some((p) => p.itemId === 'espresso' || p.itemId === 'coffee_corner');
        if (hasCoffee && present(state).length) out.push(...playCue('sfx.coffee', t));
      }
      if (nextAmbient === null) nextAmbient = t + VOICE.ambientMinGap + rng() * VOICE.ambientSpread;
      if (running && t >= nextAmbient) {
        nextAmbient = t + VOICE.ambientMinGap + rng() * VOICE.ambientSpread;
        if (t - lastVoiceMoment.t >= VOICE.ambientMinGap) {
          const here = present(state);
          if (here.length) { const p = pick(here); out.push(...bark(p, moodEmotion(p, rng), t, { priority: 3 })); lastVoiceMoment.t = t; }
        }
      }
      return out;
    },

    get musicState() { return { ...music }; },
  };
}
