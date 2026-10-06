// Full screen for the whole page (the canvas and the interface), from a tap. Safari on iPad
// still wants the webkit-prefixed calls on some versions, so both spellings are tried.
import { h } from './dom.js';

const root = () => document.documentElement;

const requestFn = () => root().requestFullscreen ?? root().webkitRequestFullscreen ?? null;
const exitFn = () => document.exitFullscreen ?? document.webkitExitFullscreen ?? null;

export const fullscreenActive = () => !!(document.fullscreenElement ?? document.webkitFullscreenElement);

// An installed app already runs without browser chrome.
export const isStandalone = () => !!(window.navigator?.standalone || window.matchMedia?.('(display-mode: standalone)').matches
  || window.matchMedia?.('(display-mode: fullscreen)').matches);

export const fullscreenAvailable = () => !!requestFn() && !!exitFn() && !isStandalone();

// True while the player wants full screen: set by a tap on the button, cleared by their own exit. A
// drop while it is set (the keyboard opening on iPad) is the browser's doing.
let wanted = false;

// Must be called from a tap or click. Resolves to an error message, or null when it worked.
export async function toggleFullscreen() {
  try {
    if (fullscreenActive()) { wanted = false; await exitFn().call(document); }
    else { await requestFn().call(root()); wanted = true; }
    return null;
  } catch (e) {
    return e?.message || 'This browser did not allow full screen.';
  }
}

// Calls cb when full screen starts or ends (by the button, Esc or a system gesture); returns the unsubscribe.
export function onFullscreenChange(cb) {
  const events = ['fullscreenchange', 'webkitfullscreenchange'];
  events.forEach((e) => document.addEventListener(e, cb));
  return () => events.forEach((e) => document.removeEventListener(e, cb));
}

const coarse = () => !!window.matchMedia?.('(pointer: coarse)').matches;

// Keeps the page sized to the screen across a full screen change (the renderer sizes itself on resize,
// and a browser can report the new size late), and offers a one-tap way back when the browser dropped
// full screen on its own (a fresh tap is required to enter again).
export function watchFullscreen(layer) {
  if (!fullscreenAvailable()) return null;
  const back = h('button.btn.fsback', { onclick: async () => { await toggleFullscreen(); sync(); } }, 'Back to full screen');
  back.style.display = 'none';
  layer.append(back);
  const sync = () => { back.style.display = wanted && !fullscreenActive() && coarse() ? '' : 'none'; };
  return onFullscreenChange(() => {
    // Leaving by the player's own tap or Esc on a desktop keyboard is not a drop; the button clears `wanted`.
    if (fullscreenActive()) wanted = true;
    sync();
    [0, 250, 700].forEach((ms) => setTimeout(() => window.dispatchEvent(new Event('resize')), ms));
  });
}
