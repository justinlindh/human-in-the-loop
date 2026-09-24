import { h, clear, setText, setWidth, toggleClass } from './dom.js';
import { roleColor, roleName, traitInfo, MOOD_INFO } from './content.js';
import { icon } from './icons.js';

const SKIN = ['#ffe0c7', '#f5c9a4', '#e0a67c', '#c68658', '#9a6440', '#6b4428'];

// Portraits come from the renderer's 3D characters when it offers them (renderer.portrait returns a
// cached URL, or null while queued); the drawn chibi is the fallback and the placeholder while queued.
let source = null;
const pending = new Set(); // { el, person, size, kind: 'el' | 'src' }
const live = new Set(); // { el, handle }
const MAX_PENDING = 400;

export function setPortraitSource(getRenderer) {
  source = getRenderer;
  addEventListener('hitl:portraits', upgradePending);
  // Live canvases are disposed once their element leaves the page.
  setInterval(() => { for (const l of live) if (!l.el.isConnected) { l.handle.dispose?.(); live.delete(l); } }, 1000);
  // A light poll as well, in case a finished batch arrives without the event.
  setInterval(() => { if (pending.size) upgradePending(); }, 500);
}

function rendered(person, size) {
  const r = source?.();
  if (!r?.portrait) return undefined;
  try { return r.portrait(person, { size }) ?? null; } catch { return undefined; }
}

function imgFor(url, person, size) {
  const img = document.createElement('img');
  img.className = 'portrait';
  img.alt = '';
  img.src = url;
  img.style.width = img.style.height = `${size / 16}em`;
  img.style.background = tint(roleColor(person.role), 0.72);
  return img;
}

function track(entry) {
  if (pending.size >= MAX_PENDING) for (const e of pending) if (!e.el.isConnected) pending.delete(e);
  if (pending.size < MAX_PENDING) pending.add(entry);
}

function upgradePending() {
  for (const e of pending) {
    if (!e.el.isConnected) { pending.delete(e); continue; }
    const url = rendered(e.person, e.size);
    if (!url) continue;
    pending.delete(e);
    if (e.kind === 'src') e.el.src = url;
    else e.el.replaceWith(imgFor(url, e.person, e.size));
  }
}

// Head-and-shoulders portrait element for a person (staff, candidate, or founder archetype).
export function portrait(person, size = 48) {
  const url = rendered(person, size);
  if (url) return imgFor(url, person, size);
  const c = drawnPortrait(person, size);
  if (url === null) track({ el: c, person, size, kind: 'el' });
  return c;
}

// An animated portrait for the one person in focus; falls back to a still one.
export function portraitLive(person, size = 88) {
  const r = source?.();
  if (!r?.portraitLive) return portrait(person, size);
  try {
    const handle = r.portraitLive(person, { size });
    const el = handle.el;
    el.classList.add('portrait');
    el.style.width = el.style.height = `${size / 16}em`;
    el.style.background = tint(roleColor(person.role), 0.72);
    live.add({ el, handle });
    return el;
  } catch {
    return portrait(person, size);
  }
}

// Chibi head-and-shoulders portrait drawn from a staff member's appearance.
function drawnPortrait(person, size = 48) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = document.createElement('canvas');
  c.width = c.height = Math.round(size * dpr);
  c.className = 'portrait';
  c.style.width = c.style.height = `${size / 16}em`;
  const g = c.getContext('2d');
  if (!g) return c;
  g.scale((size * dpr) / 64, (size * dpr) / 64);
  drawPortrait(g, person);
  return c;
}

const urlCache = new Map();

// Portrait as a cached data URL, for places that show many small copies (the chat feed).
export function portraitURL(person, size = 44) {
  const r = rendered(person, size);
  if (r) return r;
  return drawnURL(person, size);
}

// An <img> avatar that swaps to the rendered portrait when it arrives.
export function portraitImg(person, size = 44, cls = 'av') {
  const img = document.createElement('img');
  img.className = cls;
  img.alt = '';
  const r = rendered(person, size);
  img.src = r || drawnURL(person, size);
  if (r === null) track({ el: img, person, size, kind: 'src' });
  return img;
}

function drawnURL(person, size) {
  const a = person.appearance ?? {};
  const key = `${person.id}|${person.mood}|${person.role}|${a.skin}|${a.hair}|${a.hairColor}|${a.shirt}|${a.accessory}|${size}`;
  let url = urlCache.get(key);
  if (!url) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    if (g) { g.scale(size / 64, size / 64); drawPortrait(g, person); }
    url = c.toDataURL();
    if (urlCache.size > 300) urlCache.clear();
    urlCache.set(key, url);
  }
  return url;
}

function drawPortrait(g, p) {
  const a = p.appearance ?? {};
  const role = roleColor(p.role);
  const skin = SKIN[a.skin ?? 1] ?? SKIN[1];
  const hair = a.hairColor ?? '#2b1d16';
  const shirt = a.shirt ?? role;
  const ink = '#2a2630';

  g.fillStyle = tint(role, 0.72);
  roundRect(g, 0, 0, 64, 64, 12);
  g.fill();

  g.lineWidth = 2.2;
  g.strokeStyle = ink;
  // shoulders
  g.fillStyle = shirt;
  g.beginPath();
  g.ellipse(32, 66, 24 + (a.build ?? 1) * 2, 17, 0, Math.PI, 0);
  g.fill();
  g.stroke();
  // collar in role color so the team reads at a glance
  g.fillStyle = role;
  g.beginPath();
  g.moveTo(25, 50); g.lineTo(32, 57); g.lineTo(39, 50); g.closePath();
  g.fill();
  g.stroke();

  const hx = 32, hy = 30, r = 17;
  const style = a.hair ?? 0;
  // back hair for long styles
  g.fillStyle = hair;
  if (style === 2 || style === 4) {
    g.beginPath();
    roundRect(g, hx - r - 2, hy - 6, (r + 2) * 2, style === 2 ? 26 : 18, 8);
    g.fill();
    g.stroke();
  }
  // head
  g.fillStyle = skin;
  g.beginPath();
  g.arc(hx, hy, r, 0, Math.PI * 2);
  g.fill();
  g.stroke();

  // hair on top
  g.fillStyle = hair;
  g.beginPath();
  switch (style) {
    case 5: break; // bald
    case 1: // spiky
      g.moveTo(hx - r, hy - 2);
      for (let i = 0; i <= 5; i++) {
        const x = hx - r + (i * 2 * r) / 5;
        g.lineTo(x, hy - r - (i % 2 ? 9 : 2));
      }
      g.lineTo(hx + r, hy - 2);
      g.quadraticCurveTo(hx, hy - 12, hx - r, hy - 2);
      break;
    case 3: // bun
      g.arc(hx, hy - r - 3, 6, 0, Math.PI * 2);
      g.moveTo(hx + r, hy - 3);
      g.arc(hx, hy - 3, r, 0, Math.PI, true);
      break;
    case 6: // curly
      for (let i = 0; i < 7; i++) {
        const ang = Math.PI + (i / 6) * Math.PI;
        g.moveTo(hx + Math.cos(ang) * r + 5, hy + Math.sin(ang) * r);
        g.arc(hx + Math.cos(ang) * r, hy + Math.sin(ang) * r - 1, 5, 0, Math.PI * 2);
      }
      break;
    case 7: // mohawk
      roundRect(g, hx - 4, hy - r - 8, 8, 16, 4);
      break;
    default: // short cap of hair
      g.moveTo(hx + r, hy - 1);
      g.arc(hx, hy - 1, r, 0, Math.PI, true);
      g.quadraticCurveTo(hx - 4, hy - 10, hx + r, hy - 1);
  }
  g.fill();
  if (style !== 5) g.stroke();

  // face
  const mood = p.mood ?? 'ok';
  g.fillStyle = ink;
  const eyeY = hy + 3;
  if (mood === 'burnout') {
    g.lineWidth = 2;
    for (const ex of [hx - 6, hx + 6]) {
      g.beginPath(); g.moveTo(ex - 2.5, eyeY - 2.5); g.lineTo(ex + 2.5, eyeY + 2.5); g.moveTo(ex + 2.5, eyeY - 2.5); g.lineTo(ex - 2.5, eyeY + 2.5); g.stroke();
    }
  } else if (mood === 'away') {
    g.lineWidth = 2;
    for (const ex of [hx - 6, hx + 6]) { g.beginPath(); g.arc(ex, eyeY, 2.6, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
  } else {
    for (const ex of [hx - 6, hx + 6]) { g.beginPath(); g.arc(ex, eyeY, 2.2, 0, Math.PI * 2); g.fill(); }
  }
  g.fillStyle = 'rgba(255,110,120,0.35)';
  g.beginPath(); g.arc(hx - 10, hy + 8, 3, 0, Math.PI * 2); g.arc(hx + 10, hy + 8, 3, 0, Math.PI * 2); g.fill();
  g.strokeStyle = ink;
  g.lineWidth = 2;
  g.beginPath();
  if (mood === 'ok' || mood === 'away') g.arc(hx, hy + 8, 4.5, 0.15 * Math.PI, 0.85 * Math.PI);
  else if (mood === 'coasting') { g.moveTo(hx - 4, hy + 11); g.lineTo(hx + 4, hy + 11); }
  else g.arc(hx, hy + 14, 4.5, 1.15 * Math.PI, 1.85 * Math.PI);
  g.stroke();

  // accessories
  g.lineWidth = 2;
  switch (a.accessory) {
    case 'glasses':
      g.beginPath(); g.arc(hx - 6, eyeY, 4.8, 0, Math.PI * 2); g.moveTo(hx + 10.8, eyeY); g.arc(hx + 6, eyeY, 4.8, 0, Math.PI * 2);
      g.moveTo(hx - 1.2, eyeY); g.lineTo(hx + 1.2, eyeY); g.stroke();
      break;
    case 'headphones':
      g.strokeStyle = ink; g.lineWidth = 3;
      g.beginPath(); g.arc(hx, hy - 1, r + 2, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      g.fillStyle = '#ff7eb6';
      for (const sx of [hx - r - 1, hx + r + 1]) { g.beginPath(); roundRect(g, sx - 4, hy - 4, 8, 12, 3); g.fill(); g.lineWidth = 2; g.stroke(); }
      break;
    case 'beanie':
      g.fillStyle = a.shirt ?? '#e5484d';
      g.beginPath(); g.moveTo(hx + r + 1, hy - 4); g.arc(hx, hy - 4, r + 1, 0, Math.PI, true); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.arc(hx, hy - r - 5, 3.5, 0, Math.PI * 2); g.fill(); g.stroke();
      break;
    case 'cap':
      g.fillStyle = role;
      g.beginPath(); g.moveTo(hx + r, hy - 5); g.arc(hx, hy - 5, r, 0, Math.PI, true); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); roundRect(g, hx - 2, hy - 8, r + 10, 5, 2.5); g.fill(); g.stroke();
      break;
    default: break;
  }
}

function roundRect(g, x, y, w, hh, r) {
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + hh, r);
  g.arcTo(x + w, y + hh, x, y + hh, r);
  g.arcTo(x, y + hh, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function tint(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(c + (251 - c) * amt);
  const r = mix((n >> 16) & 255), gg = mix((n >> 8) & 255), b = mix(n & 255);
  return `rgb(${r},${gg},${b})`;
}

// A labelled bar that can be refreshed cheaply.
export function meter({ label, value = 0, max = 100, color, cls = '', showValue = true, fmt } = {}) {
  const fill = h('i', color ? { style: { background: color } } : null);
  const bar = h(`div.bar${cls ? `.${cls}` : ''}`, null, fill);
  const v = showValue ? h('span.num.mv') : null;
  const el = h('div.meter', null, label ? h('span.ml', { text: label }) : null, bar, v);
  const set = (val, col) => {
    setWidth(fill, max > 0 ? val / max : 0);
    if (v) setText(v, fmt ? fmt(val) : Math.round(val));
    if (col && fill.style.background !== col) fill.style.background = col;
  };
  set(value);
  return { el, set, fill, bar };
}

export function moodColor(p) {
  return (MOOD_INFO[p.mood] ?? MOOD_INFO.ok).color;
}

export function roleChip(role) {
  return h('span.pill.role', { style: { background: roleColor(role), color: '#fff' }, text: roleName(role) });
}

export function seniorityChip(s) {
  return h(`span.pill.sen.${s}`, { text: s === 'senior' ? 'Senior' : s === 'mid' ? 'Mid' : 'Junior' });
}

export function traitChips(ids = []) {
  return ids.map((id) => {
    const t = traitInfo(id);
    return h('span.pill.trait', { title: t.desc, text: t.name });
  });
}

export function stars(fit) {
  // fit in roughly [0.6, 1.5] maps onto 1 to 5 stars
  const n = Math.max(1, Math.min(5, Math.round(((fit - 0.6) / 0.9) * 4 + 1)));
  const el = h('span.stars', { title: `Fit ${fit.toFixed(2)}x` });
  for (let i = 0; i < 5; i++) el.append(h(i < n ? 'span.on' : 'span.off', null, icon('star')));
  return el;
}

// A block of UI that rebuilds only when its signature changes, and otherwise runs cheap binders.
// Rebuilds are deferred while the player is using a form control inside it.
export function liveView(sigFn, buildFn) {
  const el = h('div.live');
  let sig = null;
  let binds = [];
  function update(state, force) {
    const s = sigFn(state);
    const busy = el.contains(document.activeElement) && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
    if ((s !== sig && !busy) || force) {
      sig = s;
      binds = [];
      clear(el);
      const out = buildFn(state, (fn) => binds.push(fn));
      if (out) el.append(...[].concat(out).filter(Boolean));
    }
    for (const b of binds) b(state);
  }
  return { el, update, invalidate: () => { sig = null; } };
}

// Two-step confirm: first click arms, second click within 3 s runs.
export function confirmButton(label, armedLabel, cls, onConfirm) {
  let armed = 0;
  const b = h(`button.btn.${cls}`, { text: label });
  b.addEventListener('click', () => {
    if (armed && performance.now() - armed < 3000) {
      armed = 0;
      setText(b, label);
      onConfirm();
      return;
    }
    armed = performance.now();
    setText(b, armedLabel);
    setTimeout(() => { if (armed) { armed = 0; setText(b, label); } }, 3000);
  });
  return b;
}

export function tabs(list, current, onPick) {
  const el = h('div.panel-tabs');
  const labels = list.map((t) => h('span', { text: t.label }));
  const btns = list.map((t, i) => h('button.tab', { onclick: () => onPick(t.id) }, t.icon ? icon(t.icon, { size: 16 }) : null, t.icon ? ' ' : null, labels[i]));
  el.append(...btns);
  const set = (id) => btns.forEach((b, i) => toggleClass(b, 'on', list[i].id === id));
  set(current);
  const setLabel = (id, text) => { const i = list.findIndex((t) => t.id === id); if (i >= 0) setText(labels[i], text); };
  const setHidden = (id, hide) => { const i = list.findIndex((t) => t.id === id); if (i >= 0) btns[i].style.display = hide ? 'none' : ''; };
  return { el, set, setLabel, setHidden };
}

export function sparkline(values, { w = 160, hgt = 36, color = '#34c38f', min = 0, max = 100 } = {}) {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = w * dpr; c.height = hgt * dpr;
  c.style.width = `${w / 16}em`; c.style.height = `${hgt / 16}em`;
  const g = c.getContext('2d');
  if (!g || values.length < 2) return c;
  g.scale(dpr, dpr);
  const x = (i) => 3 + (i / (values.length - 1)) * (w - 6);
  const y = (v) => hgt - 3 - ((Math.max(min, Math.min(max, v)) - min) / (max - min || 1)) * (hgt - 6);
  g.fillStyle = color + '33';
  g.beginPath(); g.moveTo(x(0), hgt);
  values.forEach((v, i) => g.lineTo(x(i), y(v)));
  g.lineTo(x(values.length - 1), hgt); g.closePath(); g.fill();
  g.strokeStyle = color; g.lineWidth = 2.2; g.lineJoin = 'round';
  g.beginPath();
  values.forEach((v, i) => (i ? g.lineTo(x(i), y(v)) : g.moveTo(x(i), y(v))));
  g.stroke();
  g.fillStyle = color;
  g.beginPath(); g.arc(x(values.length - 1), y(values[values.length - 1]), 3, 0, Math.PI * 2); g.fill();
  return c;
}
