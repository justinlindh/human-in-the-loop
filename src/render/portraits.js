import * as THREE from 'three';
import { createCharacter } from './character.js';
import { ROLE_COLORS, PALETTE } from './palette.js';

// Menu portraits rendered from the same chibi builder the office uses: head and shoulders from a
// three-quarter angle on a transparent background.
//
// portrait(person, { size }) -> image URL | null   cached; null until rendered (a few per frame),
//                                                     then window 'hitl:portraits' fires
// portraitLive(person, { size }) -> { el, dispose }  a canvas redrawn each frame (idle, blinks)
//
// One small offscreen WebGL renderer serves both; no post chain.

const BUCKETS = [64, 128, 176];
const MAX_CACHE = 320;
const PER_FRAME = 3;
const MAX_LIVE = 3;

const bucketFor = (px) => BUCKETS.find((b) => b >= px) ?? BUCKETS[BUCKETS.length - 1];

function keyOf(p, px) {
  return `${p.id}|${p.role}|${p.mood ?? 'ok'}|${p.legend ? 1 : 0}|${JSON.stringify(p.appearance ?? {})}|${px}`;
}

export function createPortraits({ ready, lowQuality = () => false }) {
  let gl = null;
  let scene, camera;
  const cache = new Map();     // key -> url (insertion order doubles as LRU)
  const queue = new Map();     // key -> { person, px }
  const live = new Set();
  let announce = false;

  function init() {
    if (gl) return true;
    const canvas = document.createElement('canvas');
    try {
      gl = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    } catch {
      gl = null;
      return false;
    }
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
    const yaw = 0.5, d = 2.6;
    camera.position.set(Math.sin(yaw) * d, 1.0, Math.cos(yaw) * d);
    camera.lookAt(0, 0.8, 0);
    return true;
  }

  function build(person) {
    const c = createCharacter(person.appearance ?? {}, ROLE_COLORS[person.role], { role: person.role });
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

  function renderStatic(person, px) {
    const c = build(person);
    draw(px);
    const url = gl.domElement.toDataURL('image/png');
    c.dispose();
    return url;
  }

  function portrait(person, { size = 64 } = {}) {
    if (!person) return null;
    const px = bucketFor(Math.round(size * Math.min(2, devicePixelRatio || 1)));
    const k = keyOf(person, px);
    const hit = cache.get(k);
    if (hit) { cache.delete(k); cache.set(k, hit); return hit; }
    if (!queue.has(k)) queue.set(k, { person: { ...person, appearance: { ...(person.appearance ?? {}) } }, px });
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

  function update(dt) {
    if (!ready() || (!queue.size && !live.size)) return;
    if (!init()) return;
    let n = 0;
    for (const [k, job] of queue) {
      if (n++ >= PER_FRAME) break;
      queue.delete(k);
      cache.set(k, renderStatic(job.person, job.px));
      while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
      announce = true;
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
    if (announce && !queue.size) {
      announce = false;
      dispatchEvent(new Event('hitl:portraits'));
    }
  }

  return {
    portrait, portraitLive, update,
    get stats() { return { cached: cache.size, queued: queue.size, live: live.size }; },
  };
}
