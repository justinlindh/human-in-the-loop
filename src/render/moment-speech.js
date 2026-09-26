import { B } from '../sim/balance.js';

// A bounded queue paced on render time, including the decision freeze. It never changes sim state.
export function createMomentSpeech() {
  const queue = [];
  let wait = 0;
  return {
    add(event, context = {}) {
      if (queue.some(q => q.event.id === event.id)) return;
      queue.push({ event, ...context, age: 0 });
      if (queue.length > B.momentSpeechQueueMax) queue.shift();
    },
    clear(moment = null) {
      for (let i = queue.length - 1; i >= 0; i--) if (!moment || queue[i].event.moment === moment) queue.splice(i, 1);
      if (!queue.length) wait = 0;
    },
    step(dt, status, show) {
      wait = Math.max(0, wait - dt);
      for (let i = 0; i < queue.length;) {
        const q = queue[i];
        q.age += dt;
        const state = status(q);
        if (q.age > B.momentSpeechMaxAge || state === 'drop') { queue.splice(i, 1); continue; }
        if (wait === 0 && state === 'play') {
          queue.splice(i, 1);
          wait = show(q.event) + B.momentSpeechGap;
          break;
        }
        i++;
      }
    },
    get size() { return queue.length; },
  };
}
