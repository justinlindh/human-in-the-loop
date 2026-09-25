import * as THREE from 'three';
import { PALETTE as P } from './palette.js';

// Screen content drawn into a small pool of canvases and shared by every monitor that shows the
// same variant. Canvases redraw at 4 Hz. Screens are MeshBasicMaterial with the color pushed
// above 1 so bright glyph pixels cross the bloom threshold while the dark background does not.

const W = 256, H = 160;
const RATE = 0.25;
const FNS = ['engineering', 'support', 'sales', 'marketing', 'qa', 'ops'];
const FN_LABEL = { engineering: 'ENG', support: 'SUP', sales: 'SAL', marketing: 'MKT', qa: 'QA', ops: 'OPS' };
const CODE_COLORS = [P.screen_blue, P.screen_cyan, P.screen_green, P.screen_amber, P.screen_pink];

function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w = W, h = H) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // Screen and window quads come from glTF, whose V axis runs top-down, so the canvas is not flipped.
  tex.flipY = false;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  return { c, ctx: c.getContext('2d'), tex };
}

function codeLines(seed, n) {
  const r = mulberry(seed);
  return Array.from({ length: n }, () => {
    const indent = Math.floor(r() * 4) * 12;
    const toks = [];
    let x = indent;
    const k = 1 + Math.floor(r() * 4);
    for (let i = 0; i < k; i++) {
      const w = 12 + Math.floor(r() * 46);
      toks.push({ x, w, c: CODE_COLORS[Math.floor(r() * CODE_COLORS.length)] });
      x += w + 8;
    }
    return toks;
  });
}

const DRAW = {
  code(v, t) {
    const { ctx } = v;
    ctx.fillStyle = P.screen_bg;
    ctx.fillRect(0, 0, W, H);
    const lh = 13;
    const off = (t * 18 + v.seed * 7) % (v.lines.length * lh);
    ctx.fillStyle = '#2b3147';
    ctx.fillRect(0, 0, 22, H);
    for (let i = 0; i < 14; i++) {
      const li = Math.floor(off / lh) + i;
      const y = i * lh - (off % lh) + 8;
      const line = v.lines[li % v.lines.length];
      ctx.fillStyle = '#4a5270';
      ctx.fillRect(6, y, 10, 5);
      for (const tk of line) {
        ctx.fillStyle = tk.c;
        ctx.fillRect(30 + tk.x, y, tk.w, 6);
      }
    }
    if (Math.floor(t * 2) % 2) {
      ctx.fillStyle = P.paper;
      ctx.fillRect(40 + (v.seed * 13) % 120, H - 20, 7, 11);
    }
  },
  ui(v, t) {
    const { ctx } = v;
    ctx.fillStyle = '#23283a';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#343b55';
    ctx.fillRect(0, 0, W, 18);
    ctx.fillRect(0, 18, 48, H);
    const accent = CODE_COLORS[v.seed % CODE_COLORS.length];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i === Math.floor(t / 2) % 3 ? accent : '#5a6384';
      ctx.fillRect(8, 30 + i * 18, 32, 8);
    }
    for (let i = 0; i < 4; i++) {
      const x = 60 + (i % 2) * 96, y = 28 + Math.floor(i / 2) * 64;
      ctx.fillStyle = '#2e3550';
      ctx.fillRect(x, y, 86, 56);
      ctx.fillStyle = i === 0 ? accent : '#8b93b5';
      ctx.fillRect(x + 8, y + 10, 40 + ((i * 17 + v.seed * 5) % 30), 7);
      ctx.fillStyle = '#6b7396';
      ctx.fillRect(x + 8, y + 24, 60, 5);
      ctx.fillRect(x + 8, y + 34, 48, 5);
    }
    const bx = 60 + ((t * 40) % 180);
    ctx.fillStyle = P.paper;
    ctx.fillRect(bx, H - 14, 6, 6);
  },
  chart(v, t) {
    const { ctx } = v;
    ctx.fillStyle = P.screen_bg;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#384062';
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(12, i * 30); ctx.lineTo(W - 10, i * 30); ctx.stroke(); }
    const n = 24;
    ctx.strokeStyle = v.seed % 2 ? P.screen_green : P.screen_cyan;
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = 14 + i * ((W - 28) / (n - 1));
      const y = H - 24 - (i / n) * 70 - Math.sin(i * 0.9 + t * 1.5 + v.seed) * 12;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const h = 14 + ((i * 29 + v.seed * 11 + Math.floor(t)) % 40);
      ctx.fillStyle = i % 2 ? P.screen_amber : P.screen_pink;
      ctx.fillRect(18 + i * 16, H - 8 - h * 0.5, 10, h * 0.5);
    }
  },
  game(v, t) {
    const { ctx } = v;
    ctx.fillStyle = '#1b1830';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = CODE_COLORS[i % CODE_COLORS.length];
      const x = ((i * 43 + t * 60) % (W + 20)) - 10;
      ctx.fillRect(x, 20 + (i % 4) * 14, 10, 8);
    }
    ctx.fillStyle = P.screen_amber;
    const px = W / 2 + Math.sin(t * 2) * 60;
    ctx.fillRect(px - 8, H - 30, 16, 10);
    ctx.fillStyle = P.paper;
    ctx.fillRect(px - 1, H - 40 - ((t * 120) % 90), 3, 8);
  },
  gray(v) {
    const { ctx } = v;
    ctx.fillStyle = '#2a2b31';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#4a4c55';
    for (let i = 0; i < 8; i++) ctx.fillRect(28, 16 + i * 16, 40 + ((i * 37) % 120), 6);
  },
  red(v, t) {
    const { ctx } = v;
    const on = Math.floor(t * 4) % 2 === 0;
    ctx.fillStyle = on ? '#4a1318' : '#2a0d12';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = P.alarm_red;
    ctx.fillRect(0, 0, W, 22);
    ctx.fillStyle = P.paper;
    ctx.font = '700 14px monospace';
    ctx.fillText('INCIDENT', 10, 16);
    ctx.fillStyle = on ? P.alarm_red : '#8a2a30';
    ctx.beginPath();
    ctx.moveTo(W / 2, 44); ctx.lineTo(W / 2 + 40, 116); ctx.lineTo(W / 2 - 40, 116);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2a0d12';
    ctx.fillRect(W / 2 - 4, 66, 8, 28);
    ctx.fillRect(W / 2 - 4, 100, 8, 8);
  },
  off(v) {
    v.ctx.fillStyle = P.screen_off;
    v.ctx.fillRect(0, 0, W, H);
  },
};

// Office-wide screen takeovers (a staged decision's 'screens' prop): every monitor shows one of
// these instead of its own content for as long as the decision is open.
const OVERLAY = {
  red: DRAW.red,
  // Ransomware: a grinning skull that bobs, and a wallet address that blinks.
  skull(v, t) {
    const { ctx } = v;
    ctx.fillStyle = '#12090c';
    ctx.fillRect(0, 0, W, H);
    const bob = Math.sin(t * 5 + v.seed) * 4;
    const cx = W / 2, cy = 62 + bob;
    // Screens are drawn brighter than their canvas (brightness); a mid grey lands as bone white.
    ctx.fillStyle = '#8a857c';
    ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(cx - 18, cy + 18, 36, 18);
    ctx.fillStyle = '#12090c';
    for (const dx of [-12, 12]) { ctx.beginPath(); ctx.arc(cx + dx, cy - 2, 8, 0, Math.PI * 2); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(cx, cy + 8); ctx.lineTo(cx - 4, cy + 15); ctx.lineTo(cx + 4, cy + 15); ctx.fill();
    for (let i = -1; i <= 1; i++) ctx.fillRect(cx + i * 10 - 1, cy + 22, 2, 14);
    const on = Math.floor(t * 3) % 2 === 0;
    ctx.fillStyle = on ? P.alarm_red : '#8a2a30';
    ctx.font = '700 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PAY 12 BTC TO', cx, 124);
    ctx.fillText('0xDEADBEEF...', cx, 142);
    ctx.textAlign = 'left';
  },
};

export const SCREEN_VARIANTS = ['code', 'code', 'code', 'ui', 'chart', 'code', 'ui', 'chart'];

export function createScreens() {
  const pool = new Map();
  // The takeover on every monitor ('red' | 'skull' | null): a screen made while one is up shows it
  // too (a decision card holds the office still, so no later redraw would come).
  let overlay = null;
  const mats = new Set();
  let brightness = 1.7;

  function variant(key) {
    let v = pool.get(key);
    if (v) return v;
    const [kind, seedStr] = key.split(':');
    const seed = Number(seedStr ?? 0);
    v = { kind, seed, ...makeCanvas(), lines: kind === 'code' ? codeLines(seed + 1, 40) : null };
    const static_ = kind === 'gray' || kind === 'off';
    v.static = static_;
    const mat = new THREE.MeshBasicMaterial({ map: v.tex, color: new THREE.Color().setScalar(kind === 'gray' || kind === 'off' ? 1 : brightness) });
    mat.name = `screen_${key}`;
    mat.userData.bright = !(kind === 'gray' || kind === 'off');
    mats.add(mat);
    v.mat = mat;
    (overlay ? OVERLAY[overlay] : DRAW[kind])(v, 0);
    v.tex.needsUpdate = true;
    pool.set(key, v);
    return v;
  }

  // Material for a screen: kind is code | ui | chart | game | gray | red | off; seed picks a variant.
  function material(kind, seed = 0) {
    const s = kind === 'gray' || kind === 'red' || kind === 'off' ? 0 : seed % 4;
    return variant(`${kind}:${s}`).mat;
  }

  // Desk screens cycle through a fixed variant list by desk index.
  function deskMaterial(i) {
    return material(SCREEN_VARIANTS[i % SCREEN_VARIANTS.length], i);
  }

  // Agent monitoring wall: one bar per function by automation level, red flash while alarmed.
  const wall = { ...makeCanvas(512, 288), levels: Object.fromEntries(FNS.map((f) => [f, 0])), alarm: 0 };
  const wallMat = new THREE.MeshBasicMaterial({ map: wall.tex, color: new THREE.Color().setScalar(brightness) });
  wallMat.userData.bright = true;
  mats.add(wallMat);
  function drawWall(t) {
    const { ctx } = wall;
    const alarm = wall.alarm > 0 && Math.floor(t * 4) % 2 === 0;
    ctx.fillStyle = alarm ? '#3c1016' : P.screen_bg;
    ctx.fillRect(0, 0, 512, 288);
    ctx.fillStyle = alarm ? P.alarm_red : '#2e3552';
    ctx.fillRect(0, 0, 512, 34);
    ctx.fillStyle = P.paper;
    ctx.font = '700 20px monospace';
    ctx.fillText(alarm ? 'ROGUE AGENT' : 'AGENTS', 14, 25);
    const active = FNS.reduce((a, f) => a + wall.levels[f], 0);
    ctx.fillStyle = alarm ? P.alarm_red : P.screen_green;
    ctx.fillText(`${Math.round(active * 100 / FNS.length)}%`, 430, 25);
    FNS.forEach((f, i) => {
      const y = 52 + i * 38;
      ctx.fillStyle = '#8b93b5';
      ctx.font = '700 16px monospace';
      ctx.fillText(FN_LABEL[f], 14, y + 16);
      ctx.fillStyle = '#262c44';
      ctx.fillRect(70, y, 420, 22);
      const lvl = wall.levels[f];
      const wob = lvl > 0 ? Math.sin(t * 5 + i) * 0.02 : 0;
      const w = Math.max(0, Math.min(1, lvl + wob)) * 420;
      ctx.fillStyle = alarm && i === Math.floor(t * 3) % FNS.length ? P.alarm_red : lvl > 0.7 ? P.screen_amber : P.screen_cyan;
      ctx.fillRect(70, y, w, 22);
      for (let k = 0; k < 5; k++) {
        const px = 70 + ((t * 90 * (0.5 + lvl) + k * 84 + i * 30) % 420);
        if (px < 70 + w) { ctx.fillStyle = P.paper; ctx.fillRect(px, y + 8, 6, 6); }
      }
    });
    wall.tex.needsUpdate = true;
  }
  drawWall(0);

  function setAutomation(automation) {
    for (const f of FNS) wall.levels[f] = automation?.[f]?.level ?? 0;
  }
  function alarm(seconds) { wall.alarm = Math.max(wall.alarm, seconds); }

  // Windows: sky and a city skyline, blended by daylight; lit windows appear at night.
  const win = makeCanvas(128, 128);
  win.tex.colorSpace = THREE.SRGBColorSpace;
  const winMat = new THREE.MeshBasicMaterial({ map: win.tex, color: new THREE.Color(1, 1, 1) });
  const sky = (d) => [new THREE.Color(P.window_night).lerp(new THREE.Color(P.window_day), d), new THREE.Color(P.sky_night_bottom).lerp(new THREE.Color('#f6e7cf'), d)];
  const skyline = (() => {
    const r = mulberry(99);
    const b = [];
    let x = -4;
    while (x < 132) { const w = 10 + r() * 18; b.push({ x, w, h: 30 + r() * 60, lit: Array.from({ length: 24 }, () => r() < 0.35) }); x += w + 2; }
    return b;
  })();
  let winKey = -1;
  function drawWindows(daylight) {
    const q = Math.round(daylight * 8);
    if (q === winKey) return;
    winKey = q;
    const d = q / 8;
    const { ctx } = win;
    const [top, bottom] = sky(d);
    top.lerp(eraTint, 0.22 * d + 0.08);
    bottom.lerp(eraTint, 0.3 * d + 0.1);
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, `#${top.getHexString(THREE.SRGBColorSpace)}`);
    g.addColorStop(1, `#${bottom.getHexString(THREE.SRGBColorSpace)}`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const bld = new THREE.Color('#1a2040').lerp(new THREE.Color('#b9c6cf'), d);
    for (const b of skyline) {
      ctx.fillStyle = `#${bld.getHexString(THREE.SRGBColorSpace)}`;
      ctx.fillRect(b.x, 128 - b.h, b.w, b.h);
      if (d < 0.5) {
        ctx.fillStyle = P.city_lit;
        let k = 0;
        for (let yy = 128 - b.h + 6; yy < 124; yy += 9) {
          for (let xx = b.x + 3; xx < b.x + b.w - 4; xx += 6) {
            if (b.lit[k++ % b.lit.length]) ctx.fillRect(xx, yy, 3, 4);
          }
        }
      }
    }
    // Glass sheen
    ctx.fillStyle = `rgba(255,255,255,${0.08 + d * 0.1})`;
    ctx.beginPath();
    ctx.moveTo(20, 0); ctx.lineTo(50, 0); ctx.lineTo(0, 60); ctx.lineTo(0, 30);
    ctx.fill();
    win.tex.needsUpdate = true;
    winMat.color.setScalar(THREE.MathUtils.lerp(1.35, 1.0, d) + swell * 0.9 * Math.sin(Math.min(1, (1 - swell) * 3) * Math.PI / 2 + 0.3));
  }

  // Era tint on the skyline, with a brief swell of window light when an era arrives.
  const ERA_TINT = { classic: '#f3c9a0', chatgbt: '#9fe0d0', agents: '#b8a8f0', consolidation: '#a9b0bb', plateau: '#f2b98a' };
  const eraTint = new THREE.Color(ERA_TINT.classic);
  const eraFrom = new THREE.Color(), eraTo = new THREE.Color(ERA_TINT.classic);
  let eraT = 1, swell = 0, lastDaylight = 1;
  function setEra(id, flourish = false) {
    eraFrom.copy(eraTint);
    eraTo.set(ERA_TINT[id] ?? ERA_TINT.classic);
    eraT = flourish ? 0 : 1;
    if (!flourish) eraTint.copy(eraTo);
    swell = flourish ? 1 : 0;
    wallMat.userData.eraGlow = id === 'agents' ? 1.35 : id === 'plateau' ? 0.75 : 1;
    wallMat.color.setScalar(brightness * wallMat.userData.eraGlow);
    winKey = -1;
  }
  drawWindows(1);

  // kind: 'red' | 'skull' | null. Every pooled screen redraws at once, including static ones.
  function setOverlay(kind) {
    const k = OVERLAY[kind] ? kind : null;
    if (k === overlay) return;
    overlay = k;
    for (const v of pool.values()) {
      (overlay ? OVERLAY[overlay] : DRAW[v.kind])(v, t);
      v.tex.needsUpdate = true;
    }
  }

  let acc = 0;
  let t = 0;
  function update(dt, env) {
    t += dt;
    if (eraT < 1 || swell > 0) {
      eraT = Math.min(1, eraT + dt / 2.5);
      eraTint.copy(eraFrom).lerp(eraTo, eraT);
      swell = Math.max(0, swell - dt / 3);
      winKey = -1;
    }
    wall.alarm = Math.max(0, wall.alarm - dt);
    acc += dt;
    if (env) lastDaylight = env.daylight;
    drawWindows(lastDaylight);
    if (acc < RATE) return;
    acc = 0;
    for (const v of pool.values()) {
      if (overlay) OVERLAY[overlay](v, t);
      else if (v.static) continue;
      else DRAW[v.kind](v, t);
      v.tex.needsUpdate = true;
    }
    drawWall(t);
  }

  function setBrightness(b) {
    brightness = b;
    for (const m of mats) if (m.userData.bright) m.color.setScalar(b * (m.userData.eraGlow ?? 1));
  }

  return { material, deskMaterial, wallMaterial: () => wallMat, windowMaterial: () => winMat, setAutomation, alarm, update, setBrightness, setEra, setOverlay };
}
