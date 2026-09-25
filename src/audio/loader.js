// Buffers by asset id. Real assets come from src/audio/assets.json, written by the audio build:
//   { sampleRate, music: { <era>: { bpm, beds: [{ id, bars, stems: { full: { file, duration, loopStart, loopEnd } } }] } },
//     stingers: { <name>: { file, duration } }, ui: { <name>: { file } }, sfx: { <name>: { file } },
//     voice: { <bank>: { file, set, emotions: { <emotion>: [[offset s, duration s], ...] } } },
//     voiceVariants: { fem: [bankIds], masc: [bankIds] }, crowd: { file, loopStart, loopEnd } }
// Files are Ogg Opus with an .m4a twin for browsers that cannot play Opus. Asset ids used by the
// manifest ('ui/click', 'music/classic/a', 'voice/<bank>', 'voice/crowd', 'stingers/era') map onto
// that tree; anything missing, or failing to load, is synthesized (synth.js).

import { synthesize } from './synth.js';

export const ASSETS = Object.values(import.meta.glob('./assets.json', { eager: true, import: 'default' }))[0] ?? {};
const BASE = import.meta.env?.BASE_URL ?? '/';

// The asset entry for a manifest id, or null.
export function entryFor(id) {
  const [kind, a, b] = id.split('/');
  if (kind === 'music') {
    const bed = ASSETS.music?.[a]?.beds?.find((x) => x.id === b) ?? ASSETS.music?.[a]?.beds?.[0];
    return bed?.stems?.full ?? null;
  }
  if (kind === 'voice') return a === 'crowd' ? ASSETS.crowd ?? null : ASSETS.voice?.[a] ?? null;
  if (kind === 'stingers') return ASSETS.stingers?.[a] ?? null;
  if (kind === 'ui') return ASSETS.ui?.[a] ?? null;
  if (kind === 'sfx') return ASSETS.sfx?.[a] ?? null;
  if (kind === 'ambience') return ASSETS.ambience?.[a] ?? null;
  if (kind === 'musicNight') return ASSETS.musicNight?.[a] ?? null;
  return null;
}

let opusOk = null;
function url(file) {
  if (opusOk === null) {
    try { opusOk = !!document.createElement('audio').canPlayType('audio/ogg; codecs="opus"'); } catch { opusOk = true; }
  }
  return `${BASE}audio/${opusOk ? file : file.replace(/\.ogg$/, '.m4a')}`;
}

// Voice banks decode at this rate: speech keeps its clarity and the decoded PCM is half the size.
// Playback resamples to the context rate.
export const VOICE_RATE = 24000;
const isVoiceBank = (id) => id.startsWith('voice/') && id !== 'voice/crowd';

export function createLoader(ctx) {
  let voiceCtx;
  // A tiny offline context whose only job is decoding at VOICE_RATE; null where that is unsupported.
  const voiceDecoder = () => {
    if (voiceCtx !== undefined) return voiceCtx;
    const OAC = globalThis.OfflineAudioContext ?? globalThis.webkitOfflineAudioContext;
    try { voiceCtx = OAC && ctx.sampleRate !== VOICE_RATE ? new OAC(1, 1, VOICE_RATE) : null; } catch { voiceCtx = null; }
    return voiceCtx;
  };
  const decode = (id, ab) => {
    const vc = isVoiceBank(id) ? voiceDecoder() : null;
    return vc ? vc.decodeAudioData(ab.slice(0)).catch(() => ctx.decodeAudioData(ab)) : ctx.decodeAudioData(ab);
  };
  const cache = new Map();   // id -> AudioBuffer
  const pending = new Map(); // id -> Promise
  const failed = new Set();  // ids whose delivered file failed; they stay on the placeholder
  const waiters = new Map(); // id -> [callback(ok)]
  const settle = (id, ok) => { for (const cb of waiters.get(id) ?? []) cb(ok); waiters.delete(id); };

  function load(id) {
    if (cache.has(id) || pending.has(id) || failed.has(id)) return;
    const e = entryFor(id);
    if (!e?.file) return;
    pending.set(id, fetch(url(e.file)).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then((ab) => decode(id, ab)).then((buf) => { cache.set(id, buf); pending.delete(id); settle(id, true); })
      .catch(() => { failed.add(id); pending.delete(id); settle(id, false); }));
  }

  return {
    meta: (id) => entryFor(id),
    sampleRate: () => ASSETS.sampleRate ?? 48000,
    // A buffer now: the real one if decoded, else a placeholder (and the real one starts loading).
    get(id) {
      if (cache.has(id)) return cache.get(id);
      load(id);
      const key = `synth:${id}`;
      if (!cache.has(key)) cache.set(key, synthesize(ctx, id));
      return cache.get(key);
    },
    // True once the real file for id is decoded (not a placeholder).
    ready: (id) => cache.has(id) && !!entryFor(id)?.file,
    preload(ids) { for (const id of ids) load(id); },
    // Drops decoded buffers whose id matches, so they can be collected. A source already playing one
    // keeps its own reference; a later get() or preload() decodes it again.
    release(match) {
      for (const id of [...cache.keys()]) {
        const real = id.startsWith('synth:') ? id.slice(6).split('#')[0] : id;
        if (match(real)) cache.delete(id);
      }
    },
    // Decoded PCM held in the cache, in bytes (32-bit float per sample per channel).
    bytes() { let n = 0; for (const b of cache.values()) n += b.length * b.numberOfChannels * 4; return n; },
    // Ids with a delivered file decoded right now.
    loaded: () => [...cache.keys()].filter((id) => !id.startsWith('synth:')),
    // Calls cb(true) once the delivered file for id is decoded, cb(false) if it failed or there is none.
    whenReady(id, cb) {
      if (cache.has(id) && entryFor(id)?.file) { cb(true); return; }
      if (!entryFor(id)?.file || failed.has(id)) { cb(false); return; }
      (waiters.get(id) ?? waiters.set(id, []).get(id)).push(cb);
      load(id);
    },
  };
}
