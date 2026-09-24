import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { PALETTE as P } from './palette.js';

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
  .hitl-sign .in { padding: 2px 8px; border-radius: 8px; background: ${P.paper}; color: ${P.ink};
    border: 2px solid ${P.ink}; font: 600 12px Fredoka, sans-serif; }
  `;
  document.head.appendChild(css);
}

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
      l = { el, inner, obj, t: 0, life: 1, kind: '', follow: null, jit: new THREE.Vector3(), rise: 0 };
    }
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

  // Speech bubble for a few seconds; replaces any bubble already on the same person.
  function say(text, follow, seconds = 3, offsetY = 1.45) {
    for (const o of live) if (o.kind === 'say' && o.follow === follow) o.t = o.life;
    const l = acquire();
    l.kind = 'say';
    l.el.className = 'hitl-lbl hitl-say';
    l.inner.textContent = text.length > 70 ? `${text.slice(0, 67)}...` : text;
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
      l.inner.style.transform = `scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
      const fade = l.kind === 'stat' ? 0.5 : 0.35;
      l.el.style.opacity = String(Math.min(1, (l.life - l.t) / fade));
    }
  }

  function clearFor(follow) {
    for (const l of live) if (l.follow === follow) l.t = l.life;
  }

  const speechCount = () => live.filter((l) => l.kind === 'say').length;
  return { stat, say, update, clearFor, speechCount, get count() { return live.length; } };
}
