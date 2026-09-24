// Buffers by asset id. Real assets come from src/audio/assets.json (written by the audio build step):
//   { "files": { "<id>": { "url": "audio/...", "loop": [startSample, endSample]?,
//                          "sprite": { "<emotion>": [[offsetS, durationS], ...] }? } } }
// Anything missing there, or failing to load, is synthesized (synth.js), so the game always has sound.

import { synthesize } from './synth.js';

const ASSETS = Object.values(import.meta.glob('./assets.json', { eager: true, import: 'default' }))[0]?.files ?? {};
const BASE = import.meta.env?.BASE_URL ?? '/';

export function createLoader(ctx) {
  const cache = new Map();   // id -> AudioBuffer
  const pending = new Map(); // id -> Promise

  function load(id) {
    if (cache.has(id) || pending.has(id)) return;
    const a = ASSETS[id];
    if (!a?.url) return;
    pending.set(id, fetch(`${BASE}${a.url}`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then((ab) => ctx.decodeAudioData(ab)).then((buf) => { cache.set(id, buf); })
      .catch(() => { cache.set(id, synthesize(ctx, id)); }).finally(() => pending.delete(id)));
  }

  return {
    meta: (id) => ASSETS[id] ?? null,
    // A buffer now: the real one if decoded, else a placeholder (and the real one starts loading).
    get(id) {
      if (cache.has(id)) return cache.get(id);
      if (ASSETS[id]?.url) { load(id); }
      const key = `synth:${id}`;
      if (!cache.has(key)) cache.set(key, synthesize(ctx, id));
      return cache.get(key);
    },
    preload(ids) { for (const id of ids) load(id); },
    hasReal: (id) => !!ASSETS[id]?.url,
  };
}
