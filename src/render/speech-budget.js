// Ambient speech shares the room's attention, including desk and staged standups.
export const SPEECH = { max: 1, gap: 6, personGap: 20 };

export function createSpeechBudget() {
  let now = 0, next = 0;
  const people = new Map();
  return {
    step(dt) { now += dt; for (const [id, until] of people) if (until <= now) people.delete(id); },
    admit(id, seconds, count, { moment = false } = {}) {
      if (!moment && (count >= SPEECH.max || now < next || (people.get(id) ?? 0) > now)) return false;
      next = now + seconds + SPEECH.gap;
      people.set(id, now + SPEECH.personGap);
      return true;
    },
  };
}
