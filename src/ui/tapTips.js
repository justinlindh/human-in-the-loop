// Touch has no hover: tapping an element whose title holds information (a stat chip, a pill, a
// review) shows that title in a small bubble. Buttons and form controls keep their tap action.
import { h, setText } from './dom.js';

const SHOW_MS = 3200;

export function createTapTips(layer) {
  const bubble = h('div.taptip');
  bubble.style.display = 'none';
  layer.append(bubble);
  let timer = 0;

  function hide() { bubble.style.display = 'none'; clearTimeout(timer); }

  layer.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') return;
    const el = e.target.closest?.('[title]');
    if (!el || !el.title || !layer.contains(el)) { hide(); return; }
    if (el.closest('button, select, input, textarea, a, .tile, .pick')) return;
    setText(bubble, el.title);
    bubble.style.display = '';
    const box = layer.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    const x = Math.max(8, Math.min(box.width - bw - 8, r.left - box.left + r.width / 2 - bw / 2));
    const below = r.bottom - box.top + 8;
    const y = below + bh > box.height - 8 ? r.top - box.top - bh - 8 : below;
    bubble.style.left = `${x}px`;
    bubble.style.top = `${y}px`;
    clearTimeout(timer);
    timer = setTimeout(hide, SHOW_MS);
  });

  return { hide };
}
