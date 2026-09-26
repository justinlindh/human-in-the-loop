// Image memes in Yak (chat events with image: { id, alt }). A message shows the picture; a tap
// opens it large over the game, and a tap or Esc closes it. The image files are
// memes/<id>.webp (in the feed) and memes/<id>@2x.webp (enlarged); a picture that fails to load
// gives way to its alt caption as text, so the message always reads.
import { h, setText } from './dom.js';

const BASE = `${import.meta.env?.BASE_URL ?? '/'}memes/`;
const safe = (id) => String(id ?? '').replace(/[^a-z0-9_-]/gi, '');
export const memeUrl = (id, big = false) => `${BASE}${safe(id)}${big ? '@2x' : ''}.webp`;

// The picture for one message, or null when the event has none.
export function memeView(image, { onOpen } = {}) {
  if (!image?.id || !safe(image.id)) return null;
  const alt = image.alt ?? '';
  const img = h('img.ymeme-img', { src: memeUrl(image.id), alt, loading: 'lazy', decoding: 'async', draggable: 'false' });
  const btn = h('button.ymeme', { type: 'button', 'aria-label': alt ? `Open the image: ${alt}` : 'Open the image', onclick: (e) => { e.stopPropagation(); onOpen?.(image); } }, img);
  img.addEventListener('error', () => btn.replaceWith(h('div.mtext.ymeme-alt', { text: alt ? `[${alt}]` : '[an image that did not load]' })), { once: true });
  return btn;
}

// One enlarged view for the whole UI layer.
export function createMemeBox(layer) {
  const img = h('img.memebox-img', { alt: '' });
  const cap = h('div.memebox-cap');
  const back = h('div.memebox', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Image', onclick: () => close() }, img, cap);
  back.style.display = 'none';
  layer.append(back);
  let small = '';
  img.addEventListener('error', () => {
    if (!small) return;
    if (img.getAttribute('src') !== small) img.src = small;
    else img.hidden = true;
  });
  function open(image) {
    small = memeUrl(image.id);
    img.hidden = false;
    img.src = memeUrl(image.id, true);
    img.alt = image.alt ?? '';
    setText(cap, image.alt ?? '');
    back.style.display = '';
  }
  function close() {
    if (back.style.display === 'none') return false;
    back.style.display = 'none';
    small = '';
    img.removeAttribute('src');
    return true;
  }
  return { open, close, get isOpen() { return back.style.display !== 'none'; } };
}
