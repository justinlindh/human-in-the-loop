// A small caption while the renderer stages a moment (the first user test, and others to come):
// one line near the bottom of the screen that fades in and out, never a modal. The renderer
// announces moments with window events: hitl:moment { phase: 'start' | 'end', id, key, caption? }.
// The text comes from the event, else from the sim's data (MOMENT_CAPTIONS by key), else a
// built-in line for the moments that exist today.
//
// Spotlights (the moments the clock holds for; renderer.spotlight(), hitl:spotlight) add a Skip
// button to the caption, which ends the moment and lets the clock run. At the top speed a
// spotlight is skipped as it starts, and its caption becomes a toast instead.
import { phoneLayout } from './media.js';
import { h, setText, toggleClass } from './dom.js';
import { icon } from './icons.js';

const DATA = Object.values(import.meta.glob('../data/moments.js', { eager: true }))[0] ?? {};
const FALLBACK = {
  first_user_test: 'A stranger is trying your product. The founders are hiding.',
  waffle_party: 'The waffle cart has rolled in. The lights are down. Nobody is working.',
  music_night: 'Music night. The winner picked the genre. Everyone else is being brave.',
};
const MAX_MS = 12000;   // a moment whose end never arrives still lets its caption go
const TOP_SPEED = 4;   // the fastest game speed: spotlights skip themselves

export const momentCaption = (key) => DATA.MOMENT_CAPTIONS?.[key] ?? FALLBACK[key] ?? '';

export function createMomentCaptions(layer, { getRenderer = () => null, getSpeed = () => 1, toast = () => {}, sfx = () => {} } = {}) {
  const text = h('span.mcap-text');
  const skipBtn = h('button.btn.small.mcap-skip', { type: 'button', 'aria-label': 'Skip this moment', onclick: () => skip() }, 'Skip', icon('speed.fastest', { size: 14 }));
  const el = h('div.moment-cap', { role: 'status', 'aria-live': 'polite', dataset: { occludes: '' } }, text, skipBtn);
  layer.append(el);
  let cur = null, timer = 0;
  let spot = null;       // { kind, key } while a spotlight plays
  let autoSkipped = '';  // the key of the spotlight top speed already skipped

  const lineFor = (key, caption) => caption ?? momentCaption(key);
  function show() {
    toggleClass(el, 'spot', !!spot);
    toggleClass(el, 'bare', !!spot && !cur && !text.textContent);
    el.classList.toggle('show', !!cur || !!spot);
  }
  function skip() {
    if (!spot) return;
    sfx('click');
    getRenderer()?.endSpotlight?.();
  }

  // Just above the bottom menu bar, not the taller Yak column, so it stays off the office floor.
  // On phones the bottom row stacks and the stylesheet's position is kept.
  function place() {
    const menu = layer.querySelector('.bottom .menu');
    if (!menu || phoneLayout()) { el.style.bottom = ''; return; }
    const box = layer.getBoundingClientRect(), r = menu.getBoundingClientRect();
    el.style.bottom = `${Math.round(box.bottom - r.top + 14)}px`;
  }

  function hide(id) {
    if (id && cur !== id) return;
    cur = null;
    clearTimeout(timer);
    show();
  }

  addEventListener('hitl:moment', (e) => {
    const d = e.detail ?? {};
    if (d.phase === 'end') { hide(d.id); return; }
    if (d.phase !== 'start') return;
    const line = lineFor(d.key, d.caption);
    if (!line) return;
    cur = d.id ?? d.key;
    setText(text, line);
    place();
    clearTimeout(timer);
    timer = setTimeout(() => hide(cur), MAX_MS);
    show();
  });

  addEventListener('hitl:spotlight', (e) => {
    const d = e.detail ?? {};
    if (d.active) {
      spot = { kind: d.kind, key: d.key };
      if (!cur) { const line = momentCaption(d.kind); if (line) setText(text, line); else setText(text, ''); }
      place();
    } else if (spot?.key === d.key) spot = null;
    show();
  });

  // Once a frame: the top speed skips a spotlight as soon as it plays, leaving its caption as a toast.
  function update() {
    if (!spot || spot.key === autoSkipped || getSpeed() < TOP_SPEED) return;
    autoSkipped = spot.key;
    const line = momentCaption(spot.kind) || (cur ? text.textContent : '');
    getRenderer()?.endSpotlight?.();
    if (line) toast(line, 'info');
  }

  return { hide: () => hide(), update, skip, get spotlight() { return spot; }, get shown() { return el.classList.contains('show') ? text.textContent : null; } };
}
