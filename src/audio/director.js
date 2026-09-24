// The pure audio director: sim events, UI cues, clicks and state in; a list of commands out.
// No DOM, no WebAudio, no Math.random: variation comes from its own seeded rng, so a fixed input
// gives the same commands (and it runs headless in Node).
//
// Commands:
//   { op: 'play', cue, file, bus, gain, at, priority, voiceKey? }
//   { op: 'music', era, bed, at, fade }              crossfade to a bed at time `at`
//   { op: 'musicMix', level, lowpass, fade }         music level and filter
//   { op: 'duck', key, on }                          hold or release a music duck
//   { op: 'stopAll', bus }

import { ASSETS } from './loader.js';
import { BUSES, CUES, ON_EVENT, UI_CUES, MUSIC, CROSSFADE_BARS, PAUSE_LOWPASS, PAUSE_GAIN, MOOD,
  VOICE_VARIANTS, VOICE, GROUP_CUES, isFirstLaunch, resignReason, isWarmExit } from './manifest.js';

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
  const music = { era: null, bed: null, pendingEra: null, level: null, lowpass: undefined, paused: null, title: null };

  const pick = (arr) => arr[Math.floor(rng() * arr.length) % arr.length];

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
    const out = [{ op: 'play', cue: id, file: pick(c.files), bus: c.bus, gain: gain * j, at: t, priority: c.priority ?? 5 }];
    if (c.duck) out.push({ op: 'duck', key: c.duck, on: true, at: t }, { op: 'duck', key: c.duck, on: false, at: t + 1.2 });
    return out;
  }

  function bark(person, emotion, t, { gain = 1, priority = 7, key = 'voice' } = {}) {
    if (!person) return [];
    // Single barks (not a cheer) never stack beyond VOICE.maxSingle at once.
    if (key === 'voice' && playing.filter((v) => v.bus === 'voice' && v.single && v.until > t).length >= VOICE.maxSingle) return [];
    if (!admit('voice', priority, t, 1.5)) return [];
    if (key === 'voice') playing[playing.length - 1].single = true;
    return [{ op: 'play', cue: 'voice.bark', file: `voice/${voiceBank(person)}`, emotion, bus: 'voice', gain, at: t, priority, voiceKey: person.id, duckKey: key }];
  }

  // A group cheer: several present people, staggered, quieter each, over a crowd bed.
  function cheer(kind, s, t, leadId = null) {
    const g = GROUP_CUES[kind];
    if (!g) return [];
    // Cheers are rare: at most one per cooldown of real time, longer at higher game speed.
    if (t - lastCheer < VOICE.cheerCooldown * Math.max(1, speedNow)) return [];
    const here = present(s);
    if (!here.length) return [];
    const n = Math.min(q === 'low' ? g.lowMaxVoices : g.maxVoices, here.length);
    const lead = here.find((p) => p.id === leadId);
    const rest = here.filter((p) => p !== lead);
    for (let i = rest.length - 1; i > 0; i--) { const k = Math.floor(rng() * (i + 1)); [rest[i], rest[k]] = [rest[k], rest[i]]; }
    const who = (lead ? [lead, ...rest] : rest).slice(0, n);
    const base = g.groupGain;
    const out = [{ op: 'duck', key: g.duck, on: true, at: t }];
    let at = t;
    who.forEach((p, i) => {
      if (i > 0) at += g.stagger[0] + rng() * (g.stagger[1] - g.stagger[0]);
      const [lo, hi] = g.gainSpreadDb;
      const spread = 10 ** ((lo + rng() * (hi - lo)) / 20);
      out.push(...bark(p, pick(g.emotions), at, { gain: base * spread, priority: 8, key: 'cheer' }));
    });
    if (g.crowdBed > 0) out.push({ op: 'play', cue: 'voice.crowd', file: 'voice/crowd', bus: 'ambience', gain: g.crowdBed, at: t, priority: 4 });
    out.push({ op: 'duck', key: g.duck, on: false, at: at + 1.5 });
    lastVoiceMoment.t = at;
    lastCheer = t;
    return out;
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
        // Voice moments.
        if (e.type === 'launch') { if (isFirstLaunch(e, state)) out.push(...cheer('launch', state, t + 0.15)); }
        else if (e.type === 'incentive' && e.reward === 'waffle_party') out.push(...cheer('waffleParty', state, t + 0.2, e.staffId));
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
      if (!state?.staff || ctx.title) return out;
      // Burnout: once per episode, from last week's moods.
      for (const p of state.staff) {
        const before = moods.get(p.id);
        if (before && before !== 'burnout' && p.mood === 'burnout' && voiceMomentOk(t)) {
          out.push(...bark(p, 'tired', t)); lastVoiceMoment.t = t;
        }
        moods.set(p.id, p.mood);
      }
      // Ambient: rare, only while time runs and nothing holds the screen.
      const running = ctx.running !== false && (ctx.speed ?? 1) > 0 && !hold && !state.lockdown;
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
