import * as pacing from '../pacing.js';

// How long a speech bubble stays up: the pacing module's reading time when it provides one,
// otherwise the same rule (about 1.8 s plus 0.06 s a character, 2.5 to 7 s). At 2x and faster
// a bubble keeps 70% of it, so lines stay readable when the week runs quicker.
function fallback(text) {
  return Math.min(7, Math.max(2.5, 1.8 + 0.06 * (text?.length ?? 0)));
}

export function readSeconds(text) {
  return typeof pacing.readSeconds === 'function' ? pacing.readSeconds(text) : fallback(text);
}

export function holdSeconds(text, speed = 1) {
  return readSeconds(text) * (speed >= 2 ? 0.7 : 1);
}
