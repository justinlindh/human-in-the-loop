// A small caption while the renderer stages a moment (the first user test, and others to come):
// one line near the bottom of the screen that fades in and out, never a modal. The renderer
// announces moments with window events: hitl:moment { phase: 'start' | 'end', id, key, caption? }.
// The text comes from the event, else from the sim's data (MOMENT_CAPTIONS by key), else a
// built-in line for the moments that exist today.
import { h, setText } from './dom.js';

const DATA = Object.values(import.meta.glob('../data/moments.js', { eager: true }))[0] ?? {};
const FALLBACK = {
  first_user_test: 'A stranger is trying your product. The founders are hiding.',
};
const MAX_MS = 12000;   // a moment whose end never arrives still lets its caption go

export const momentCaption = (key) => DATA.MOMENT_CAPTIONS?.[key] ?? FALLBACK[key] ?? '';

export function createMomentCaptions(layer) {
  const text = h('span.mcap-text');
  const el = h('div.moment-cap', { role: 'status', 'aria-live': 'polite', dataset: { occludes: '' } }, text);
  layer.append(el);
  let cur = null, timer = 0;

  function hide(id) {
    if (id && cur !== id) return;
    cur = null;
    clearTimeout(timer);
    el.classList.remove('show');
  }

  addEventListener('hitl:moment', (e) => {
    const d = e.detail ?? {};
    if (d.phase === 'end') { hide(d.id); return; }
    if (d.phase !== 'start') return;
    const line = d.caption ?? momentCaption(d.key);
    if (!line) return;
    cur = d.id ?? d.key;
    setText(text, line);
    el.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(() => hide(cur), MAX_MS);
  });

  return { hide: () => hide(), get shown() { return el.classList.contains('show') ? text.textContent : null; } };
}
