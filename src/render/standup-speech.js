import { B } from '../sim/balance.js';

// A turn owns its reading hold only after show accepts it. Status can wait for arrival or drop a leaver.
export function createStandupSpeech(lines) {
  let index = 0, wait = 0;
  return {
    interrupt() {
      if (wait > 0) { index--; wait = 0; }
    },
    step(dt, status, show) {
      if (dt <= 0) return;
      wait = Math.max(0, wait - dt);
      if (wait > 0) return;
      while (index < lines.length) {
        const line = lines[index], ready = status(line);
        if (ready === 'drop') { index++; continue; }
        if (ready !== 'play') return;
        const seconds = show(line);
        if (!(seconds > 0)) return;
        index++;
        wait = seconds + B.standupSpeechGap;
        return;
      }
    },
    get index() { return index; },
    get current() { return wait > 0 ? lines[index - 1] : null; },
    get done() { return index === lines.length && wait === 0; },
  };
}
