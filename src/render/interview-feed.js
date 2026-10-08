import * as THREE from 'three';
import { createCharacter } from './character.js';
import { PALETTE, ROLE_COLORS } from './palette.js';

// The Spot the AI interview feed: a candidate on a video call, drawn into a small canvas the
// decision card hosts. The chibi renders in 3D over a painted 2D room, with the call's look on top.
//
// create({ person, seed, tells, decoy, width }) -> { el, dispose, drawAt(t) } | null
//   tells: any of TELLS, the signs of an AI; decoy: one of DECOYS, a person's harmless oddity.
//   drawAt(t) draws the frame t seconds into the call, for stills and checks.
//
// Everything the feed shows is a function of the seed and the time since it started. A person moves
// on irregular timings drawn per stretch of the call; a tell swaps one of those for an exact cycle,
// or a glitch on fast moves, or a stare that never leaves the lens.

export const TELLS = ['glitch', 'loopBackground', 'loopBlink', 'lensEyes'];
export const DECOYS = ['cat', 'freeze', 'glare', 'leaver'];

const SIZE = { normal: [384, 288], low: [256, 192] };
const FPS = { normal: 30, low: 12 };
const SEG = 15;              // seconds per stretch of irregular timings
const LOOP_BG = 4.6;         // loopBackground: the window and the clock repeat on this cycle
const LOOP_BLINK = 3.3;      // loopBlink: the same blink and head tilt on this cycle
const MAX_FEEDS = 2;

// A small seeded generator (mulberry32) from any number of integer or string parts.
function rngOf(...parts) {
  let h = 2166136261;
  for (const ch of parts.join('|')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const between = (r, a, b) => a + r() * (b - a);
const smooth = (x) => { const k = Math.max(0, Math.min(1, x)); return k * k * (3 - 2 * k); };
// 0 -> 1 -> 0 over [t0, t0 + d], easing in and out over `edge` seconds.
const bump = (t, t0, d, edge = 0.15) => Math.min(smooth((t - t0) / edge), smooth((t0 + d - t) / edge));

// The irregular timings of one stretch of the call: blinks, glances away, fast moves, speech.
function stretch(seed, k) {
  const r = rngOf(seed, 'seg', k);
  const blinks = [];
  for (let t = k * SEG + between(r, 0.3, 1.8); t < (k + 1) * SEG; t += between(r, 1.7, 5.2)) {
    blinks.push(t);
    if (r() < 0.18) blinks.push(t + 0.26);
  }
  const glances = [];
  for (let t = k * SEG + between(r, 1, 3); t < (k + 1) * SEG - 1.5; t += between(r, 3.5, 6.5)) {
    glances.push({ t, d: between(r, 0.6, 1.3), x: (r() < 0.5 ? -1 : 1) * between(r, 0.5, 1), y: between(r, -0.6, 0.25) });
  }
  const moves = [];
  for (let t = k * SEG + between(r, 1.5, 4); t < (k + 1) * SEG - 1.2; t += between(r, 4.5, 8)) {
    moves.push({ t, d: between(r, 0.55, 0.8), kind: r() < 0.6 ? 'hand' : 'turn', side: r() < 0.5 ? -1 : 1 });
  }
  const talk = [];
  for (let t = k * SEG + between(r, 0.2, 1); t < (k + 1) * SEG; ) {
    const d = between(r, 1.8, 4.2);
    talk.push({ t, d, rate: between(r, 7, 10) });
    t += d + between(r, 0.8, 2.2);
  }
  const passer = r() < 0.5 ? { t: k * SEG + between(r, 1, 11), d: between(r, 2.2, 3.4), dir: r() < 0.5 ? -1 : 1, hue: Math.floor(r() * 4) } : null;
  return { blinks, glances, moves, talk, passer };
}

// Seed-wide choices: the room, the decoy's timings.
function setting(seed, decoy) {
  const r = rngOf(seed, 'room');
  const walls = [PALETTE.wall_cream, PALETTE.wall_sage, PALETTE.wall_warm, '#d9dde6', '#e8d2c8'];
  const room = {
    wall: walls[Math.floor(r() * walls.length)],
    windowLeft: r() < 0.5,
    shelf: r() < 0.7,
    plant: r() < 0.6,
    art: r() < 0.5,
    sky: r() < 0.5 ? '#bfdcef' : '#cfe3e8',
    treeLean: between(r, -0.08, 0.08),
    desk: [PALETTE.wood_honey, PALETTE.wood_light, PALETTE.laminate, PALETTE.wood_walnut][Math.floor(r() * 4)],
  };
  const d = rngOf(seed, 'decoy');
  const decoyAt = {
    cat: { t: between(d, 2.5, 5.5), d: between(d, 5, 7), coat: ['#e0a060', '#3b3742', '#9a9590', '#f2ece1'][Math.floor(d() * 4)] },
    freeze: { t: between(d, 2.5, 6), d: between(d, 1.1, 1.7), again: between(d, 9, 13) },
    leaver: { t: between(d, 2.5, 5) },
  }[decoy] ?? null;
  const n = rngOf(seed, 'nod');
  return { room, decoyAt, nod: [between(n, 0, 6), between(n, 0, 6), between(n, 0, 6)] };
}

export function createInterviewFeeds({ ready, lowQuality = () => false, wardrobe = () => null }) {
  let gl = null, scene = null, camera = null, lights = null;
  const feeds = new Set();
  let compiled = false;

  function init() {
    if (gl) return true;
    try {
      gl = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), alpha: true, antialias: true, preserveDrawingBuffer: true });
    } catch { gl = null; return false; }
    gl.debug.checkShaderErrors = false;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
    gl.setClearColor(0x000000, 0);
    scene = new THREE.Scene();
    const hemi = new THREE.HemisphereLight(new THREE.Color(PALETTE.hemi_sky_day), new THREE.Color(PALETTE.hemi_ground_day), 1.5);
    const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.sun_day), 2.2);
    key.position.set(-1.6, 2.0, 1.2);
    // The laptop's glow from below the lens.
    const screen = new THREE.PointLight(new THREE.Color(PALETTE.screen_cyan), 0.9, 3, 1.5);
    screen.position.set(0, 0.55, 0.9);
    // The ring light of the glare decoy, straight down the lens.
    const ring = new THREE.PointLight(0xffffff, 0, 4, 1.2);
    ring.position.set(0, 0.95, 1.4);
    scene.add(hemi, key, screen, ring);
    lights = { ring };
    camera = new THREE.PerspectiveCamera(36, 4 / 3, 0.1, 30);
    camera.position.set(0, 0.84, 1.55);
    camera.lookAt(0, 0.76, 0);
    camera.updateMatrixWorld();
    return true;
  }

  function create({ person, seed, tells = [], decoy = null, width = 320 } = {}) {
    if (!person || feeds.size >= MAX_FEEDS || typeof document === 'undefined') return null;
    const low = lowQuality();
    const [W, H] = SIZE[low ? 'low' : 'normal'];
    const el = document.createElement('canvas');
    el.width = W; el.height = H;
    el.style.width = `${width}px`;
    el.style.height = `${Math.round(width * 3 / 4)}px`;
    el.className = 'interview-feed';
    const frame = document.createElement('canvas');
    frame.width = W; frame.height = H;
    const ghost = document.createElement('canvas');
    ghost.width = W; ghost.height = H;
    const key = seed ?? person.id;
    const tell = new Set(tells ?? []);
    const { room, decoyAt, nod } = setting(key, decoy);
    const feed = {
      el, out: el.getContext('2d'), frame, fctx: frame.getContext('2d'), ghost, gctx: ghost.getContext('2d'),
      W, H, low, person, key, tell, decoy, room, decoyAt, nod, t: 0, last: -1, shown: -1, char: null, leaver: null,
      stretches: new Map(), static: null, dead: false,
    };
    feeds.add(feed);
    return {
      el,
      dispose() {
        feed.dead = true;
        feed.char?.dispose();
        feed.leaver?.dispose();
        feeds.delete(feed);
        if (!feeds.size && gl) { gl.dispose(); gl.forceContextLoss?.(); gl = null; scene = null; compiled = false; }
      },
      // Draws the frame `t` seconds in, stepping the characters there from the start.
      drawAt(t) {
        if (!ready() || !init()) return false;
        feed.char?.dispose(); feed.char = null;
        feed.leaver?.dispose(); feed.leaver = null;
        feed.t = 0;
        feed.move = null;
        build(feed);
        const n = Math.max(1, Math.round(t * 30));
        // Every step draws, so a freeze holds the right frame and a glitch smears the one before.
        for (let i = 0; i < n; i++) step(feed, t / n);
        return true;
      },
      get time() { return feed.t; },
      // The candidate's character, for pose checks.
      get character() { return feed.char; },
      // When things happen in the first stretch of the call, for stills and checks.
      get plan() { return { ...stretchOf(feed, 0), decoyAt: feed.decoyAt, loopBg: LOOP_BG, loopBlink: LOOP_BLINK }; },
    };
  }

  const stretchOf = (f, k) => {
    if (!f.stretches.has(k)) {
      f.stretches.set(k, stretch(f.key, k));
      if (f.stretches.size > 4) f.stretches.delete(f.stretches.keys().next().value);
    }
    return f.stretches.get(k);
  };
  const stretchesAt = (f, t) => { const k = Math.floor(t / SEG); return k > 0 ? [stretchOf(f, k - 1), stretchOf(f, k)] : [stretchOf(f, k)]; };

  function build(f) {
    const p = f.person;
    const c = createCharacter(p.appearance ?? {}, p.roleColor ?? ROLE_COLORS[p.role], { role: p.role, seed: `feed${f.key}`, wardrobe: wardrobe() });
    c.setRingScale(0.0001);
    c.pickProxy.visible = false;
    c.setShadows(false);
    c.setMood('ok');
    c.setAnim('idle');
    c.setBlink(false);
    f.char = c;
    if (f.decoy === 'leaver') {
      const r = rngOf(f.key, 'leaver');
      const roles = Object.keys(ROLE_COLORS);
      const role = roles[Math.floor(r() * roles.length)];
      f.leaver = createCharacter({ skin: Math.floor(r() * 6), hair: Math.floor(r() * 8), build: Math.floor(r() * 3) }, ROLE_COLORS[role], { role, seed: `leaver${f.key}` });
      f.leaver.setRingScale(0.0001);
      f.leaver.pickProxy.visible = false;
      f.leaver.setShadows(false);
      f.leaver.setAnim('idle');
    }
  }

  const _v = new THREE.Vector3();
  // Poses the candidate (and anyone behind them) for time f.t, advancing their animation by dt.
  function step(f, dt, render = true) {
    if (!f.char) build(f);
    f.t += dt;
    const t = f.t, c = f.char;
    const segs = stretchesAt(f, t);
    // Fast moves and glances, from this stretch and the end of the one before.
    const move = segs.flatMap((s) => s.moves).find((m) => t >= m.t && t < m.t + m.d) ?? null;
    const glance = f.tell.has('lensEyes') ? null : segs.flatMap((s) => s.glances).find((g) => t >= g.t && t < g.t + g.d) ?? null;
    const talk = segs.flatMap((s) => s.talk).find((s) => t >= s.t && t < s.t + s.d) ?? null;
    // Gaze: the lens, or somewhere off it during a glance.
    if (glance) c.lookAt(_v.set(glance.x * 1.4, 0.8 + glance.y * 0.8, 0.7), { hold: 0.2 });
    else c.lookAt(_v.copy(camera.position), { hold: 0.2 });
    // Speech: the mouth opens and closes at an uneven rate while answering.
    c.setTalk(talk ? bump(t, talk.t, talk.d, 0.2) * (0.35 + 0.35 * Math.abs(Math.sin(t * talk.rate) * Math.sin(t * talk.rate * 0.37 + 1))) : 0);
    // Blinks and head tilts: irregular, or one exact cycle for loopBlink.
    let closed, tilt, nod;
    if (f.tell.has('loopBlink')) {
      const ph = t % LOOP_BLINK;
      closed = ph > 1.2 && ph < 1.32;
      tilt = 0.1 * bump(ph, 0.9, 1.5, 0.45);
      nod = 0.03 * Math.sin((ph / LOOP_BLINK) * Math.PI * 2);
    } else {
      closed = segs.some((s) => s.blinks.some((b) => t >= b && t < b + 0.12));
      const n = f.nod;
      tilt = 0.06 * Math.sin(t * 0.53 + n[0]) + 0.03 * Math.sin(t * 1.31 + n[1]);
      nod = 0.03 * Math.sin(t * 0.77 + n[2]) + (talk ? 0.03 * Math.sin(t * 3.1) * bump(t, talk.t, talk.d, 0.3) : 0);
    }
    c.setBlink(closed);
    c.update(dt);
    c.head.rotation.z += tilt;
    c.head.rotation.x += nod;
    // The head's turn is set here, not left to the pose: the procedural pose (Low) turns the head
    // toward a lookAt target and the rig clips do not, so the two qualities would differ.
    c.head.rotation.y = 0;
    // A glance turns the head part of the way too.
    if (glance) {
      const k = bump(t, glance.t, glance.d, 0.18);
      c.head.rotation.y += glance.x * 0.35 * k;
      c.head.rotation.x -= glance.y * 0.25 * k;
    }
    if (move) {
      const k = bump(t, move.t, move.d, move.d * 0.35);
      if (move.kind === 'hand') {
        const arm = c.shoulders()[move.side > 0 ? 1 : 0];
        arm.rotation.x += -1.35 * k;
        arm.rotation.z += move.side * 0.35 * k;
        c.head.rotation.z += move.side * 0.05 * k;
      } else {
        c.head.rotation.y += move.side * 0.55 * k;
      }
    }
    f.move = move;
    if (f.leaver) {
      const L = f.leaver, t0 = f.decoyAt.t, gone = t0 + 3.2;
      if (t < t0) { L.root.position.set(-0.55, 0, -1.7); L.root.rotation.y = Math.PI * 0.85; L.setAnim('idle'); }
      else if (t < gone) { L.setAnim('walk'); L.root.rotation.y = Math.PI / 2; L.root.position.set(-0.55 + (t - t0) * 1.0, 0, -1.7); }
      L.root.visible = t < gone;
      L.update(dt);
    }
    if (render) draw(f);
  }

  // The window's view: sky, a tree that sways, someone walking past outside.
  function drawWindow(f, ctx, x, y, w, h, t) {
    const { room } = f;
    ctx.fillStyle = room.sky;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#9fbf8a';
    ctx.fillRect(x, y + h * 0.72, w, h * 0.28);
    const loop = f.tell.has('loopBackground');
    const segs = stretchesAt(f, t);
    const sway = loop
      ? 0.07 * Math.sin((t % LOOP_BG) / LOOP_BG * Math.PI * 2)
      : 0.045 * Math.sin(t * 0.9 + 1.3) + 0.03 * Math.sin(t * 2.3) + 0.02 * Math.sin(t * 0.31 + 4);
    // Tree: a trunk and a round crown that leans with the wind.
    const tx = x + w * 0.66, ty = y + h * 0.78;
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(room.treeLean + sway);
    ctx.fillStyle = PALETTE.wood_dark;
    ctx.fillRect(-w * 0.03, -h * 0.4, w * 0.06, h * 0.42);
    ctx.fillStyle = '#6f9a5f';
    ctx.beginPath(); ctx.ellipse(0, -h * 0.52, w * 0.26, h * 0.26, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#82ad6d';
    ctx.beginPath(); ctx.ellipse(-w * 0.07, -h * 0.58, w * 0.14, h * 0.14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // A passer-by outside: the same one on every cycle for loopBackground, else now and then.
    let p = null;
    if (loop) { const ph = t % LOOP_BG; if (ph < 2.6) p = { u: ph / 2.6, dir: 1, hue: 1 }; }
    else for (const s of segs) if (s.passer && t >= s.passer.t && t < s.passer.t + s.passer.d) p = { u: (t - s.passer.t) / s.passer.d, dir: s.passer.dir, hue: s.passer.hue };
    if (p) {
      const px = p.dir > 0 ? x - w * 0.1 + p.u * w * 1.2 : x + w * 1.1 - p.u * w * 1.2;
      const py = y + h * 0.86, bob = Math.abs(Math.sin(p.u * 18)) * h * 0.012;
      ctx.fillStyle = [PALETTE.fabric_terracotta, PALETTE.fabric_teal, PALETTE.fabric_mustard, PALETTE.fabric_slate][p.hue];
      ctx.beginPath(); ctx.roundRect(px - w * 0.035, py - h * 0.2 - bob, w * 0.07, h * 0.16, w * 0.02); ctx.fill();
      ctx.fillStyle = '#e2b796';
      ctx.beginPath(); ctx.arc(px, py - h * 0.25 - bob, w * 0.035, 0, Math.PI * 2); ctx.fill();
    }
  }

  // The room behind the candidate, without the window's view (a hole is left for it).
  function paintRoom(f) {
    const { W, H, room } = f;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = room.wall;
    ctx.fillRect(0, 0, W, H);
    // Soft falloff from the ceiling light.
    const g = ctx.createRadialGradient(W * 0.5, -H * 0.2, H * 0.2, W * 0.5, H * 0.3, H * 1.1);
    g.addColorStop(0, 'rgba(255,248,235,0.35)');
    g.addColorStop(1, 'rgba(60,40,30,0.18)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // The floor meets the wall where the 3D floor 2 m back lands, so whoever walks behind stands on it.
    const floorY = Math.round((1 - _e.set(0, 0, -2).project(camera).y) / 2 * H);
    ctx.fillStyle = PALETTE.floor_wood;
    ctx.fillRect(0, floorY, W, H - floorY);
    ctx.fillStyle = PALETTE.baseboard;
    ctx.fillRect(0, floorY - 5, W, 5);
    const win = room.windowLeft ? { x: W * 0.04, y: H * 0.1, w: W * 0.3, h: H * 0.42 } : { x: W * 0.66, y: H * 0.1, w: W * 0.3, h: H * 0.42 };
    f.win = win;
    ctx.fillStyle = PALETTE.plastic_white;
    ctx.fillRect(win.x - 6, win.y - 6, win.w + 12, win.h + 12);
    ctx.clearRect(win.x, win.y, win.w, win.h);
    ctx.fillStyle = PALETTE.plastic_white;
    ctx.fillRect(win.x + win.w / 2 - 2, win.y, 4, win.h);
    ctx.fillRect(win.x - 10, win.y + win.h + 4, win.w + 20, 6);
    // A door on the other side, for whoever else is at home.
    const door = room.windowLeft ? { x: W * 0.74, w: W * 0.22 } : { x: W * 0.04, w: W * 0.22 };
    ctx.fillStyle = PALETTE.wood_light;
    ctx.fillRect(door.x, H * 0.02, door.w, floorY - H * 0.02);
    ctx.fillStyle = PALETTE.wall_trim;
    ctx.fillRect(door.x - 5, H * 0.02 - 5, 5, floorY - H * 0.02 + 5);
    ctx.fillRect(door.x + door.w, H * 0.02 - 5, 5, floorY - H * 0.02 + 5);
    ctx.fillStyle = PALETTE.metal_dark;
    ctx.beginPath(); ctx.arc(room.windowLeft ? door.x + door.w * 0.15 : door.x + door.w * 0.85, H * 0.55, 3, 0, Math.PI * 2); ctx.fill();
    // Clock face; its hands are drawn every frame.
    f.clock = { x: W * (room.windowLeft ? 0.46 : 0.54), y: H * 0.13, r: H * 0.065 };
    f.clockStart = Math.floor(rngOf(f.key, 'clock')() * 40);
    ctx.fillStyle = PALETTE.plastic_white;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(f.clock.x, f.clock.y, f.clock.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (room.shelf) {
      const sx = room.windowLeft ? W * 0.38 : W * 0.4, sy = H * 0.36;
      ctx.fillStyle = PALETTE.wood_honey;
      ctx.fillRect(sx - W * 0.04, sy, W * 0.08 + W * 0.18, 5);
      const books = [PALETTE.fabric_teal, PALETTE.fabric_mustard, PALETTE.fabric_terracotta, PALETTE.fabric_slate, PALETTE.fabric_sage];
      const r = rngOf(f.key, 'books');
      for (let bx = sx - W * 0.03; bx < sx + W * 0.2; bx += W * 0.025) {
        const bh = H * between(r, 0.06, 0.1);
        ctx.fillStyle = books[Math.floor(r() * books.length)];
        ctx.fillRect(bx, sy - bh, W * 0.02, bh);
      }
    }
    if (room.plant) {
      const px = room.windowLeft ? W * 0.3 : W * 0.7, py = H * 0.98;
      ctx.fillStyle = PALETTE.fabric_terracotta;
      ctx.beginPath(); ctx.roundRect(px - W * 0.04, py - H * 0.12, W * 0.08, H * 0.12, 4); ctx.fill();
      ctx.fillStyle = '#5f8f57';
      for (let a = -1; a <= 1; a += 0.5) { ctx.beginPath(); ctx.ellipse(px + a * W * 0.035, py - H * 0.2, W * 0.025, H * 0.09, a * 0.5, 0, Math.PI * 2); ctx.fill(); }
    }
    if (room.art) {
      const ax = room.windowLeft ? W * 0.57 : W * 0.31;
      ctx.fillStyle = PALETTE.wood_walnut;
      ctx.fillRect(ax, H * 0.06, W * 0.12, H * 0.14);
      ctx.fillStyle = PALETTE.paper;
      ctx.fillRect(ax + 4, H * 0.06 + 4, W * 0.12 - 8, H * 0.14 - 8);
      ctx.fillStyle = PALETTE.rug_teal;
      ctx.beginPath(); ctx.arc(ax + W * 0.06, H * 0.13, H * 0.035, 0, Math.PI * 2); ctx.fill();
    }
    return c;
  }

  function drawClock(f, ctx, t) {
    const { x, y, r } = f.clock;
    // loopBackground: the second hand sweeps the same few seconds over and over.
    const secs = (f.tell.has('loopBackground') ? t % LOOP_BG : t) + f.clockStart;
    const hand = (a, len, w) => { ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(a) * len, y - Math.cos(a) * len); ctx.stroke(); };
    ctx.strokeStyle = PALETTE.ink;
    hand(1.9, r * 0.5, 2.5);
    hand(4.4, r * 0.75, 2);
    ctx.strokeStyle = PALETTE.alarm_red ?? '#d0463b';
    hand((Math.floor(secs) / 60) * Math.PI * 2, r * 0.85, 1.2);
  }

  // The cat decoy: it walks along the bottom of the frame, sits in front a while, and walks off.
  function drawCat(f, ctx, t) {
    const { W, H } = f, a = f.decoyAt;
    const u = t - a.t;
    if (u < 0 || u > a.d) return;
    const walkIn = 1.2, walkOut = a.d - 1.2;
    const xs = W * 1.15, xm = W * 0.6, xe = -W * 0.2;
    const x = u < walkIn ? xs + (xm - xs) * smooth(u / walkIn) : u > walkOut ? xm + (xe - xm) * smooth((u - walkOut) / 1.2) : xm;
    const sitting = u >= walkIn && u <= walkOut;
    const y = H * (sitting ? 0.86 : 0.93), s = H / 288;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = a.coat;
    ctx.strokeStyle = 'rgba(42,38,48,0.35)';
    ctx.lineWidth = 2;
    // Tail: a thick curve that swishes up across the frame while it sits.
    const sw = Math.sin(u * 2.4) * 0.5;
    ctx.lineWidth = 14; ctx.lineCap = 'round'; ctx.strokeStyle = a.coat;
    ctx.beginPath(); ctx.moveTo(40, 10);
    ctx.quadraticCurveTo(95, -30 + sw * 30, 70 + sw * 40, sitting ? -110 : -40); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 18, sitting ? 48 : 62, sitting ? 46 : 32, 0, 0, Math.PI * 2); ctx.fill();
    const hx = -46, hy = sitting ? -30 : -6;
    ctx.beginPath(); ctx.arc(hx, hy, 30, 0, Math.PI * 2); ctx.fill();
    for (const e of [-1, 1]) { ctx.beginPath(); ctx.moveTo(hx + e * 22, hy - 14); ctx.lineTo(hx + e * 18, hy - 44); ctx.lineTo(hx + e * 4, hy - 26); ctx.fill(); }
    ctx.fillStyle = PALETTE.ink;
    for (const e of [-1, 1]) { ctx.beginPath(); ctx.ellipse(hx + e * 10, hy, 3.5, 5, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  const _e = new THREE.Vector3();
  // Ring-light glare: a ring in each eye and a bright wash over the face.
  function drawGlare(f, ctx) {
    const { W, H } = f;
    const pts = [-1, 1].map((s) => { f.char.eyeWorld(_e, s); _e.project(camera); return { x: (_e.x + 1) / 2 * W, y: (1 - _e.y) / 2 * H }; });
    const cx = (pts[0].x + pts[1].x) / 2, cy = (pts[0].y + pts[1].y) / 2;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, H * 0.3);
    g.addColorStop(0, 'rgba(255,255,255,0.32)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = Math.max(1.5, H / 160);
    for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y - H * 0.004, H * 0.014, 0, Math.PI * 2); ctx.stroke(); }
  }

  // The glitch tell: the figure tears and smears for the fastest part of a quick move.
  function glitch(f, ctx, t) {
    const m = f.move;
    if (!m) return;
    // The fastest third of the move, about a fifth of a second.
    const k = bump(t, m.t + m.d * 0.33, m.d * 0.34, 0.03);
    if (k <= 0) return;
    const { W, H } = f;
    const r = rngOf(f.key, 'tear', Math.floor(t * 15));
    // The figure from a few frames back, trailing the move.
    ctx.globalAlpha = 0.45 * k;
    ctx.drawImage(f.ghost, -m.side * W * 0.02, 0);
    ctx.globalAlpha = 1;
    // A few thin bands of the figure slip sideways.
    const x0 = W * 0.28, w = W * 0.44;
    for (let i = 0; i < 3; i++) {
      const y = Math.floor(H * between(r, 0.2, 0.75)), h = Math.max(2, Math.floor(H * between(r, 0.01, 0.025)));
      const dx = Math.round((r() < 0.5 ? -1 : 1) * W * between(r, 0.012, 0.03) * k);
      ctx.drawImage(f.frame, x0, y, w, h, x0 + dx, y, w, h);
    }
  }

  function inFreeze(f, t) {
    if (f.decoy !== 'freeze') return false;
    const a = f.decoyAt, ph = t % (a.again + a.d);
    return ph >= a.t && ph < a.t + a.d;
  }

  function draw(f) {
    const { W, H, fctx, out } = f, t = f.t;
    const frozen = inFreeze(f, t);
    if (!frozen) {
      if (!f.static) f.static = paintRoom(f);
      fctx.clearRect(0, 0, W, H);
      drawWindow(f, fctx, f.win.x, f.win.y, f.win.w, f.win.h, t);
      fctx.drawImage(f.static, 0, 0);
      drawClock(f, fctx, t);
      lights.ring.intensity = f.decoy === 'glare' ? 2.4 : 0;
      gl.setPixelRatio(1);
      gl.setSize(W, H, false);
      if (f.leaver) scene.add(f.leaver.root);
      scene.add(f.char.root);
      gl.render(scene, camera);
      scene.remove(f.char.root);
      if (f.leaver) scene.remove(f.leaver.root);
      fctx.drawImage(gl.domElement, 0, 0, W, H);
      if (f.tell.has('glitch')) glitch(f, fctx, t);
      // The figure alone from before a quick move, for the glitch's trail.
      if (!f.move) { f.gctx.clearRect(0, 0, W, H); f.gctx.drawImage(gl.domElement, 0, 0, W, H); }
      if (f.decoy === 'glare') drawGlare(f, fctx);
      // The desk edge across the bottom of the picture.
      fctx.fillStyle = f.room.desk;
      fctx.fillRect(0, H * 0.9, W, H * 0.1);
      fctx.fillStyle = 'rgba(42,38,48,0.18)';
      fctx.fillRect(0, H * 0.9, W, 2);
      if (f.decoy === 'cat') drawCat(f, fctx, t);
      // A webcam's falloff at the corners.
      const v = fctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.85);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(20,16,24,0.28)');
      fctx.fillStyle = v;
      fctx.fillRect(0, 0, W, H);
    }
    out.drawImage(f.frame, 0, 0);
    drawChrome(f, out, t, frozen);
  }

  // The call's own overlay: a recording dot, the elapsed time and the connection bars.
  function drawChrome(f, ctx, t, frozen) {
    const { W, H } = f, s = H / 288;
    ctx.fillStyle = 'rgba(20,16,24,0.45)';
    ctx.beginPath(); ctx.roundRect(8 * s, H - 30 * s, 74 * s, 22 * s, 6 * s); ctx.fill();
    ctx.fillStyle = Math.floor(t * 1.2) % 2 ? '#e0574a' : '#a8352c';
    ctx.beginPath(); ctx.arc(20 * s, H - 19 * s, 5 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fbf5ea';
    ctx.font = `${Math.round(13 * s)}px ui-monospace, monospace`;
    ctx.textBaseline = 'middle';
    const sec = Math.floor(t);
    ctx.fillText(`${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`, 30 * s, H - 18.5 * s);
    // Connection bars: one bar while the picture is frozen.
    const bars = frozen ? 1 : 3;
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < bars ? (frozen ? '#e0a040' : 'rgba(251,245,234,0.9)') : 'rgba(251,245,234,0.3)';
      ctx.fillRect(W - (34 - i * 8) * s, H - (14 + i * 4) * s, 5 * s, (6 + i * 4) * s);
    }
  }

  let acc = 0;
  function update(dt) {
    if (!feeds.size || !ready() || !init()) return;
    if (!compiled) {
      compiled = 'pending';
      const probe = createCharacter({}, ROLE_COLORS.engineer, { role: 'engineer' });
      scene.add(probe.root);
      gl.compileAsync(scene, camera).catch(() => {}).finally(() => { scene?.remove(probe.root); probe.dispose(); compiled = true; });
    }
    if (compiled !== true) return;
    acc += dt;
    const low = lowQuality();
    const tick = 1 / FPS[low ? 'low' : 'normal'];
    if (acc < tick) return;
    const step_ = Math.min(acc, 0.25);
    acc = 0;
    for (const f of feeds) if (!f.dead) step(f, step_);
  }

  return { create, update, get count() { return feeds.size; } };
}
