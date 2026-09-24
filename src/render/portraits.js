import * as THREE from 'three';
import { createCharacter } from './character.js';
import { ROLE_COLORS, PALETTE } from './palette.js';

// Menu portraits rendered from the same chibi builder the office uses: head and shoulders from a
// three-quarter angle on a transparent background.
//
// portrait(person, { size }) -> image URL | null   cached; null until rendered (a few per frame),
//                                                     then window 'hitl:portraits' fires as each lands
// portraitLive(person, { size }) -> { el, dispose }  a canvas redrawn each frame (idle, blinks)
//
// One small offscreen WebGL renderer serves both; no post chain.

const BUCKETS = [64, 128, 176];
const MAX_CACHE = 320;
const PER_FRAME = 1;             // portraits rendered per frame (each is a few ms of GPU work)
const MAX_LIVE = 3;

const bucketFor = (px) => BUCKETS.find((b) => b >= px) ?? BUCKETS[BUCKETS.length - 1];

function keyOf(p, px) {
  return `${p.id}|${p.role}|${p.mood ?? 'ok'}|${p.legend ? 1 : 0}|${JSON.stringify(p.appearance ?? {})}|${px}`;
}

export function createPortraits({ ready, lowQuality = () => false }) {
  let gl = null;
  let compiled = false;
  let scene, camera;
  const cache = new Map();     // key -> url (insertion order doubles as LRU)
  const queue = new Map();     // key -> { person, px }
  const pending = new Set();   // keys rendered and being encoded
  const live = new Set();

  function init() {
    if (gl) return true;
    const canvas = document.createElement('canvas');
    try {
      gl = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    } catch {
      gl = null;
      return false;
    }
    // Shader status checks are synchronous GPU round trips; programs compile in parallel instead.
    gl.debug.checkShaderErrors = false;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.1;
    gl.setClearColor(0x000000, 0);
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(new THREE.Color(PALETTE.hemi_sky_day), new THREE.Color(PALETTE.hemi_ground_day), 1.6));
    const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.sun_day), 2.6);
    key.position.set(1.2, 2.2, 2.0);
    scene.add(key);
    const rim = new THREE.DirectionalLight(new THREE.Color(PALETTE.screen_cyan), 1.1);
    rim.position.set(-1.5, 1.4, -1.6);
    scene.add(rim);
    // Three-quarter view, a little above eye level, framing head and shoulders.
    camera = new THREE.PerspectiveCamera(20, 1, 0.1, 20);
    // Eyes a little above the middle, shoulders and the role garment in view, room for hats.
    const yaw = 0.5, d = 2.1;
    camera.position.set(Math.sin(yaw) * d, 1.02, Math.cos(yaw) * d);
    camera.lookAt(0, 0.86, 0);
    // Warm the programs up asynchronously with a sample character; portraits wait until ready.
    const probe = build({ appearance: {}, role: 'engineer', mood: 'ok' });
    gl.compileAsync(scene, camera).then(() => { compiled = true; }, () => { compiled = true; }).finally(() => probe.dispose());
    return true;
  }

  function build(person, caricature = false) {
    const c = createCharacter(person.appearance ?? {}, ROLE_COLORS[person.role], { role: person.role });
    if (caricature) {
      // Big head, small body: the party-favour caricature look.
      c.head.scale.setScalar(1.45);
      c.root.scale.set(0.92, 0.82, 0.92);
    }
    c.setRingScale(0.0001);
    c.pickProxy.visible = false;
    c.setMood(person.mood && person.mood !== 'away' ? person.mood : 'ok');
    c.setLegend(!!person.legend);
    c.setAnim('idle');
    c.update(0.016);
    scene.add(c.root);
    return c;
  }

  function draw(px) {
    gl.setPixelRatio(1);
    gl.setSize(px, px, false);
    gl.render(scene, camera);
  }

  // Encoding happens in a worker: the main thread only renders (a few ms) and reads the pixels
  // back. Without worker support it falls back to toBlob, which may encode on the main thread.
  let worker = null;
  const waiting = new Map();
  let nextId = 0;
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      worker = new Worker(new URL('./portraitEncoder.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => { const cb = waiting.get(e.data.id); waiting.delete(e.data.id); cb?.(e.data.blob ? URL.createObjectURL(e.data.blob) : null); };
      worker.onerror = () => { worker = null; for (const cb of waiting.values()) cb(null); waiting.clear(); };
    }
  } catch { worker = null; }

  function renderStatic(person, px, done) {
    const c = build(person);
    draw(px);
    c.dispose();
    const ctx = gl.getContext();
    if (worker && typeof WebGL2RenderingContext !== 'undefined' && ctx instanceof WebGL2RenderingContext) {
      // Asynchronous readback: copy into a pixel buffer and wait on a fence, polled each frame, so
      // the main thread never stalls for the GPU (shader compiles, a software renderer).
      const buf = ctx.createBuffer();
      ctx.bindBuffer(ctx.PIXEL_PACK_BUFFER, buf);
      ctx.bufferData(ctx.PIXEL_PACK_BUFFER, px * px * 4, ctx.STREAM_READ);
      ctx.readPixels(0, 0, px, px, ctx.RGBA, ctx.UNSIGNED_BYTE, 0);
      ctx.bindBuffer(ctx.PIXEL_PACK_BUFFER, null);
      const sync = ctx.fenceSync(ctx.SYNC_GPU_COMMANDS_COMPLETE, 0);
      ctx.flush();
      reads.push({ ctx, buf, sync, px, done });
      return;
    }
    const copy = document.createElement('canvas');
    copy.width = copy.height = px;
    copy.getContext('2d').drawImage(gl.domElement, 0, 0, px, px);
    copy.toBlob((blob) => done(blob ? URL.createObjectURL(blob) : null), 'image/png');
  }

  function portrait(person, { size = 64 } = {}) {
    if (!person) return null;
    const px = bucketFor(Math.round(size * Math.min(2, devicePixelRatio || 1)));
    const k = keyOf(person, px);
    const hit = cache.get(k);
    if (hit) { cache.delete(k); cache.set(k, hit); return hit; }
    if (!queue.has(k) && !pending.has(k)) queue.set(k, { person: { ...person, appearance: { ...(person.appearance ?? {}) } }, px });
    return null;
  }

  function portraitLive(person, { size = 88 } = {}) {
    const px = bucketFor(Math.round(size * Math.min(2, devicePixelRatio || 1)));
    const el = document.createElement('canvas');
    el.width = el.height = px;
    el.style.width = el.style.height = `${size}px`;
    const entry = { el, ctx: el.getContext('2d'), person: { ...person }, px, char: null, dead: false };
    // Low quality keeps a single live portrait and redraws it at half rate.
    if (live.size >= (lowQuality() ? 1 : MAX_LIVE)) {
      // Over the cap: a static image drawn once it exists.
      entry.staticOnly = true;
    }
    live.add(entry);
    return {
      el,
      dispose() {
        entry.dead = true;
        entry.char?.dispose();
        entry.char = null;
        live.delete(entry);
      },
    };
  }

  const reads = [];
  function pollReads() {
    for (let i = reads.length - 1; i >= 0; i--) {
      const r = reads[i];
      const st = r.ctx.clientWaitSync(r.sync, 0, 0);
      if (st !== r.ctx.ALREADY_SIGNALED && st !== r.ctx.CONDITION_SATISFIED) continue;
      reads.splice(i, 1);
      r.ctx.deleteSync(r.sync);
      const pixels = new Uint8Array(r.px * r.px * 4);
      r.ctx.bindBuffer(r.ctx.PIXEL_PACK_BUFFER, r.buf);
      r.ctx.getBufferSubData(r.ctx.PIXEL_PACK_BUFFER, 0, pixels);
      r.ctx.bindBuffer(r.ctx.PIXEL_PACK_BUFFER, null);
      r.ctx.deleteBuffer(r.buf);
      const id = nextId++;
      waiting.set(id, r.done);
      worker.postMessage({ id, w: r.px, h: r.px, pixels: pixels.buffer }, [pixels.buffer]);
    }
  }

  function update(dt) {
    if (reads.length) pollReads();
    if (!ready() || (!queue.size && !live.size)) return;
    if (!init()) return;
    if (!compiled) return;
    let n = 0;
    for (const [k, job] of queue) {
      if (n++ >= PER_FRAME || reads.length) break;
      queue.delete(k);
      pending.add(k);
      renderStatic(job.person, job.px, (url) => {
        pending.delete(k);
        if (!url) return;
        cache.set(k, url);
        while (cache.size > MAX_CACHE) {
          const old = cache.keys().next().value;
          const u = cache.get(old);
          if (u?.startsWith('blob:')) URL.revokeObjectURL(u);
          cache.delete(old);
        }
        dispatchEvent(new Event('hitl:portraits'));
      });
    }
    for (const e of live) {
      if (e.staticOnly) {
        const url = portrait(e.person, { size: e.px });
        if (url && !e.drawn) {
          const img = new Image();
          img.onload = () => { if (!e.dead) e.ctx.drawImage(img, 0, 0, e.px, e.px); };
          img.src = url;
          e.drawn = true;
        }
        continue;
      }
      e.acc = (e.acc ?? 0) + dt;
      if (lowQuality() && e.char && (e.skip = !e.skip)) continue;
      if (!e.char) e.char = build(e.person);
      else scene.add(e.char.root);
      e.char.update(e.acc);
      e.acc = 0;
      draw(e.px);
      e.ctx.clearRect(0, 0, e.px, e.px);
      e.ctx.drawImage(gl.domElement, 0, 0, e.px, e.px);
      scene.remove(e.char.root);
    }
  }

  // A one-off caricature canvas (big head, beaming) for a framed picture in the office.
  function caricature(person, px = 256) {
    if (!ready() || !init()) return null;
    const c = build({ ...person, mood: 'ok' }, true);
    c.setAnim('celebrate');
    c.update(0.25);
    const out = document.createElement('canvas');
    out.width = out.height = px;
    camera.position.y += 0.08;
    draw(px);
    camera.position.y -= 0.08;
    out.getContext('2d').drawImage(gl.domElement, 0, 0, px, px);
    c.dispose();
    return out;
  }

  return {
    portrait, portraitLive, update, caricature,
    get stats() { return { cached: cache.size, queued: queue.size, live: live.size }; },
  };
}
