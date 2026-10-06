// Full screen for the whole page (the canvas and the interface), from a tap. Safari on iPad
// still wants the webkit-prefixed calls on some versions, so both spellings are tried.
const root = () => document.documentElement;

const requestFn = () => root().requestFullscreen ?? root().webkitRequestFullscreen ?? null;
const exitFn = () => document.exitFullscreen ?? document.webkitExitFullscreen ?? null;

export const fullscreenActive = () => !!(document.fullscreenElement ?? document.webkitFullscreenElement);

// An installed app already runs without browser chrome.
export const isStandalone = () => !!(window.navigator?.standalone || window.matchMedia?.('(display-mode: standalone)').matches
  || window.matchMedia?.('(display-mode: fullscreen)').matches);

export const fullscreenAvailable = () => !!requestFn() && !!exitFn() && !isStandalone();

// Must be called from a tap or click. Resolves to an error message, or null when it worked.
export async function toggleFullscreen() {
  try {
    if (fullscreenActive()) await exitFn().call(document);
    else await requestFn().call(root());
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
