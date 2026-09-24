import { readSeconds as paced } from '../pacing.js';

// Bubble lifetimes come from the pacer's reading time so the renderer and the pacer agree.
export function readSeconds(text) {
  return paced(text, 1);
}

export function holdSeconds(text, speed = 1) {
  return paced(text, speed);
}
