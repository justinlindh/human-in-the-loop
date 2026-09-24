import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { PALETTE as P } from './palette.js';
import { readSeconds } from './reading.js';

// Pooled floating labels in the CSS2D layer: rising "+N Stat" bubbles and speech bubbles.
// At most MAX live at once; when full, the oldest is recycled.
const MAX = 40;
const TONE = {
  features: P.tone_features, polish: P.tone_polish, reliability: P.tone_reliability, novelty: P.tone_novelty,
  good: P.tone_good, bad: P.tone_bad, info: P.role_engineer, warn: P.role_marketer,
};

let styled = false;
function injectStyle() {
  if (styled) return;
  styled = true;
  const css = document.createElement('style');
  css.textContent = `
  .hitl-lbl { position: absolute; pointer-events: none; white-space: nowrap; will-change: transform, opacity;
    font: 700 15px Fredoka, sans-serif; color: ${P.paper}; }
  .hitl-lbl .in { display: inline-block; transform-origin: 50% 100%; }
  .hitl-stat .in { padding: 3px 10px; border-radius: 999px; border: 2.5px solid ${P.ink};
    box-shadow: 0 3px 0 ${P.ink}; text-shadow: 0 1px 0 rgba(42,38,48,.35); }
  .hitl-say .in { max-width: 220px; white-space: normal; padding: 6px 11px; border-radius: 14px;
    background: ${P.paper}; color: ${P.ink}; border: 2.5px solid ${P.ink}; box-shadow: 0 3px 0 ${P.ink};
    font: 600 13px/1.25 Fredoka, sans-serif; position: relative; }
  .hitl-say .in::after { content: ''; position: absolute; left: 50%; bottom: -9px; width: 12px; height: 12px;
    margin-left: -6px; background: ${P.paper}; border-right: 2.5px solid ${P.ink}; border-bottom: 2.5px solid ${P.ink};
    transform: rotate(45deg); }
  .hitl-leads { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
  .hitl-leads i { position: absolute; width: 2.5px; margin-left: -1.25px; background: ${P.ink}; border-radius: 2px; }
  .hitl-leads i::after { content: ''; position: absolute; left: 50%; bottom: -4px; width: 8px; height: 8px;
    margin-left: -4px; border-radius: 50%; background: ${P.ink}; box-shadow: 0 0 0 2px ${P.paper}; }
  .hitl-sign .in { padding: 2px 8px; border-radius: 8px; background: ${P.paper}; color: ${P.ink};
    border: 2px solid ${P.ink}; font: 600 12px Fredoka, sans-serif; }
  `;
  document.head.appendChild(css);
}

const GAP = 6;
const TAIL = 9;                 // the speech bubble's pointer below its box
const LEAD_MIN = 10;            // lifted further than this (px), a bubble draws its leader line

export function createLabels(parent) {
  injectStyle();
  const pool = [];
  const live = [];

  function acquire() {
    let l = pool.pop();
    if (!l && live.length >= MAX) {
      l = live.shift();
      l.obj.removeFromParent();
    }
    if (!l) {
      const el = document.createElement('div');
      const inner = document.createElement('span');
      inner.className = 'in';
      el.appendChild(inner);
      const obj = new CSS2DObject(el);
      l = { el, inner, obj, t: 0, life: 1, kind: '', follow: null, jit: new THREE.Vector3(), rise: 0, dx: 0, dy: 0 };
    }
    l.dx = l.dy = 0;
    l.px = 0; l.hideK = 1;
    return l;
  }

  function release(l) {
    l.obj.removeFromParent();
    l.follow = null;
    pool.push(l);
  }

  // Rising stat bubble over a world position (or an Object3D to follow). Per person, a same-stat
  // bubble within MERGE_S folds into the live one ("+6 Polish" + "+8 Polish" = "+14 Polish"), and
  // at most PER_PERSON show at once; extras are dropped, not queued.
  const MERGE_S = 1.0;
  const PER_PERSON = 2;
  const NUM = /^([+-]?)(\d+)\s*(.*)$/;
  function stat(text, tone, follow, offsetY = 1.25) {
    const mine = live.filter((o) => o.kind === 'stat' && o.follow === follow && o.t < o.life - 0.5);
    const m = NUM.exec(text);
    const same = m && mine.find((o) => o.tone === tone && o.t < MERGE_S && o.num && o.num.label === m[3] && o.num.sign === m[1]);
    if (same) {
      same.num.n += Number(m[2]);
      same.inner.textContent = `${same.num.sign || '+'}${same.num.n} ${same.num.label}`;
      same.w = null;
      same.t = Math.min(same.t, 0.12);
      return same;
    }
    if (mine.length >= PER_PERSON) return null;
    const l = acquire();
    l.tone = tone;
    l.num = m ? { sign: m[1], n: Number(m[2]), label: m[3] } : null;
    l.kind = 'stat';
    l.el.className = 'hitl-lbl hitl-stat';
    l.inner.textContent = text;
    l.w = null;
    l.inner.style.background = TONE[tone] ?? P.role_engineer;
    l.t = 0; l.life = 1.7; l.rise = 0.5; l.follow = follow; l.offsetY = offsetY;
    // Spread bubbles that land near each other at the same moment: stack them and nudge sideways.
    anchor(follow, l.jit.set(0, 0, 0));
    const near = live.filter((o) => o.kind === 'stat' && o.t < 0.9 && anchor(o.follow, tmp2).distanceTo(l.jit) < 1.2).length;
    l.offsetY += near * 0.26;
    l.jit.set(((near % 3) - 1) * 0.28, 0, -((near % 3) - 1) * 0.28);
    parent.add(l.obj);
    live.push(l);
    place(l);
    return l;
  }

  // Speech bubble for its reading time (or `seconds`); replaces any bubble already on the same person.
  function say(text, follow, seconds = readSeconds(text), offsetY = 1.45) {
    for (const o of live) if (o.kind === 'say' && o.follow === follow) o.t = o.life;
    const l = acquire();
    l.kind = 'say';
    l.el.className = 'hitl-lbl hitl-say';
    l.inner.textContent = text.length > 70 ? `${text.slice(0, 67)}...` : text;
    l.w = null;
    l.inner.style.background = '';
    l.t = 0; l.life = seconds; l.rise = 0; l.follow = follow; l.offsetY = offsetY;
    l.jit.set(0, 0, 0);
    parent.add(l.obj);
    live.push(l);
    place(l);
    return l;
  }

  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  function anchor(follow, out) {
    if (follow?.isObject3D) follow.getWorldPosition(out);
    else if (follow) out.set(follow.x, 0, follow.z);
    return out;
  }
  function place(l) {
    anchor(l.follow, tmp);
    l.obj.position.set(tmp.x + l.jit.x, tmp.y + l.offsetY + l.rise * Math.min(1, l.t / l.life) * 1.2, tmp.z + l.jit.z);
  }

  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const l = live[i];
      l.t += dt;
      if (l.t >= l.life) { live.splice(i, 1); release(l); continue; }
      place(l);
      // Pop in with squash and stretch (0 to 1.15 to 1 over 0.2 s), fade out at the end.
      const p = Math.min(1, l.t / 0.2);
      const s = p < 0.7 ? (p / 0.7) * 1.15 : 1.15 - ((p - 0.7) / 0.3) * 0.15;
      const sy = s * (p < 0.5 ? 1.1 : 1), sx = s * (p < 0.5 ? 0.92 : 1);
      l.inner.style.transform = `translate(${l.dx.toFixed(1)}px, ${l.dy.toFixed(1)}px) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
      const fade = l.kind === 'stat' ? 0.5 : 0.35;
      l.el.style.opacity = String(Math.min(1, (l.life - l.t) / fade));
    }
  }

  // Screen-space pass, run after the CSS2D render: speech bubbles draw over stat labels, bubbles
  // that overlap stack upward (the older one keeps its place), and stat labels slide sideways off
  // any bubble. Positions are projected like the CSS2D renderer does and sizes are measured only
  // when a label's text changes, so a frame does no layout reads. Offsets live on the inner span
  // and ease toward their targets, so nothing jumps.

  const hits = (a, b) => a.left < b.right + GAP && a.right > b.left - GAP && a.top < b.bottom + GAP && a.bottom > b.top - GAP;
  const proj = new THREE.Vector3();
  function rectOf(l, camera, w, h) {
    proj.setFromMatrixPosition(l.obj.matrixWorld).project(camera);
    const x = (proj.x * 0.5 + 0.5) * w, y = (-proj.y * 0.5 + 0.5) * h;
    return { left: x - l.w / 2, right: x + l.w / 2, top: y - l.h / 2, bottom: y + l.h / 2 };
  }
  // Leader lines for lifted bubbles, in a layer under every label so they never cross text.
  let leadLayer = null;
  const leads = [];
  function drawLeads(segs, overlay) {
    if (!leadLayer && overlay) {
      leadLayer = document.createElement('div');
      leadLayer.className = 'hitl-leads';
      overlay.prepend(leadLayer);
    }
    if (!leadLayer) return;
    while (leads.length < segs.length) { const i = document.createElement('i'); leadLayer.appendChild(i); leads.push(i); }
    leads.forEach((i, n) => {
      const g = segs[n];
      if (!g) { if (i.style.display !== 'none') i.style.display = 'none'; return; }
      i.style.display = '';
      i.style.left = `${g.x.toFixed(1)}px`;
      i.style.top = `${g.y1.toFixed(1)}px`;
      i.style.height = `${(g.y2 - g.y1).toFixed(1)}px`;
      i.style.opacity = g.o.toFixed(2);
    });
  }

  // UI panels that sit over the scene (the HUD's cards) mark themselves with a data-occludes
  // attribute. Their rectangles, relative to the labels overlay, are re-read a couple of times a
  // second; a speech bubble under one slides clear of it toward its speaker, or hides when its
  // speaker is under the panel or off screen too.
  let occluders = [];
  let occT = Infinity;
  function readOccluders(overlay) {
    const base = overlay?.getBoundingClientRect?.();
    if (!base || typeof document === 'undefined') { occluders = []; return; }
    occluders = [...document.querySelectorAll('[data-occludes]')].map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({ left: r.left - base.left, right: r.right - base.left, top: r.top - base.top, bottom: r.bottom - base.top }));
  }
  const inRect = (x, y, r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  function clearOfPanels(l, box, anchor, w, h, k) {
    const off = anchor.x < 0 || anchor.y < 0 || anchor.x > w || anchor.y > h;
    let dx = 0, hidden = false;
    for (let pass = 0; pass < 3; pass++) {
      const at = { left: box.left + dx, right: box.right + dx, top: box.top, bottom: box.bottom };
      const o = occluders.find((r) => hits(at, r));
      if (!o) break;
      if (off || inRect(anchor.x, anchor.y, o)) { hidden = true; break; }
      dx += anchor.x < (o.left + o.right) / 2 ? o.left - GAP - at.right : o.right + GAP - at.left;
    }
    l.px = (l.px ?? 0) + (dx - (l.px ?? 0)) * k;
    l.hideK = (l.hideK ?? 1) + ((hidden ? 0 : 1) - (l.hideK ?? 1)) * k;
  }

  function layout(dt, camera, w, h, overlay) {
    occT += dt;
    if (occT > 0.5) { occT = 0; readOccluders(overlay); }
    const segs = [];
    const says = [];
    const stats = [];
    for (const l of live) {
      if (l.el.style.display === 'none') continue;
      if (l.kind === 'say') says.push(l);
      else if (l.kind === 'stat') stats.push(l);
    }
    const k = 1 - Math.exp(-dt * 14);
    if (!says.length) {
      for (const l of stats) l.dx += (0 - l.dx) * k;
      drawLeads(segs, overlay);
      return;
    }
    for (const l of [...says, ...stats]) if (l.w == null) { l.w = l.el.offsetWidth; l.h = l.el.offsetHeight; }
    says.sort((a, b) => b.t - a.t);
    const placed = [];
    for (const l of says) {
      l.el.style.zIndex = String(Number(l.el.style.zIndex || 0) + 1000);
      const box = rectOf(l, camera, w, h);
      box.bottom += TAIL;
      let dy = 0;
      for (let pass = 0; pass < 6; pass++) {
        const at = { ...box, top: box.top + dy, bottom: box.bottom + dy };
        const p = placed.find((q) => hits(at, q));
        if (!p) break;
        dy = p.top - GAP - box.bottom;
      }
      l.dy += (dy - l.dy) * k;
      placed.push({ ...box, top: box.top + dy, bottom: box.bottom + dy });
      const anchor = { x: (box.left + box.right) / 2, y: box.bottom + TAIL };
      clearOfPanels(l, { ...box, top: box.top + dy, bottom: box.bottom + dy }, anchor, w, h, k);
      l.dx = l.px;
      if (l.hideK < 0.999) l.el.style.opacity = String(Number(l.el.style.opacity || 1) * l.hideK);
      // From the lifted tail tip down to where the tail would point: the speaker.
      if (-l.dy > LEAD_MIN) segs.push({ x: (box.left + box.right) / 2, y1: box.bottom + l.dy - 2, y2: box.bottom, o: Number(l.el.style.opacity || 1) });
    }
    for (const l of stats) {
      const r = rectOf(l, camera, w, h);
      let dx = 0;
      for (let pass = 0; pass < 4; pass++) {
        const at = { left: r.left + dx, right: r.right + dx, top: r.top, bottom: r.bottom };
        const p = placed.find((q) => hits(at, q));
        if (!p) break;
        const mid = (at.left + at.right) / 2;
        dx += mid < (p.left + p.right) / 2 ? p.left - GAP * 2 - at.right : p.right + GAP * 2 - at.left;
      }
      l.dx += (dx - l.dx) * k;
    }
    drawLeads(segs, overlay);
  }

  function clearFor(follow) {
    for (const l of live) if (l.follow === follow) l.t = l.life;
  }

  const speechCount = () => live.filter((l) => l.kind === 'say').length;
  const speaking = (follow) => live.some((l) => l.kind === 'say' && l.follow === follow && l.t < l.life - 0.3);
  return { stat, say, update, layout, clearFor, speechCount, speaking, get count() { return live.length; } };
}
