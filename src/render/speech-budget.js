import { B } from '../sim/balance.js';

// Ambient speech shares the room's attention. Ordered standups keep the cap with their own gaps.
export const SPEECH = { max: B.bubbleMaxOnScreen, perExtra: B.bubbleStaffPerExtra, gap: B.bubbleGapSeconds, personGap: B.bubblePersonGapSeconds };

// Ordinary bubbles allowed at once for a headcount: one in a small office, one more for each
// bubbleStaffPerExtra people, up to bubbleMaxOnScreen.
export const speechMax = (headcount = 0) => Math.max(1, Math.min(SPEECH.max, 1 + Math.floor(headcount / SPEECH.perExtra)));

export function createSpeechBudget() {
  let now = 0, max = 1;
  // Each slot keeps its own quiet beat after its line, so a bigger office talks in parallel.
  const slots = [];
  const people = new Map();
  return {
    step(dt, headcount = 0) {
      now += dt;
      max = speechMax(headcount);
      for (const [id, until] of people) if (until <= now) people.delete(id);
    },
    admit(id, seconds, count, { moment = false, standup = false } = {}) {
      let slot = 0;
      if (!moment) {
        // A standup is one conversation: its turns wait for the room to be quiet, whatever the headcount.
        if (count >= (standup ? 1 : max)) return false;
        if (!standup) {
          if ((people.get(id) ?? 0) > now) return false;
          slot = -1;
          for (let i = 0; i < max; i++) if ((slots[i] ?? 0) <= now) { slot = i; break; }
          if (slot < 0) return false;
        }
      }
      slots[slot] = now + seconds + SPEECH.gap;
      people.set(id, now + SPEECH.personGap);
      return true;
    },
  };
}
