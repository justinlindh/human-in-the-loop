// The detail of 'hitl:voice', fired once per voice bark that plays, so faces can follow the voice:
//   { staffId, emotion, take, startsIn, seconds, rate, loudness }
// loudness is the take's envelope at `rate` values per second, 0..1, peak-normalized per take. It is
// precomputed from the shipped voice banks (voice-env.json), so it is the same on every machine.
// A bark that plays the placeholder synth (no delivered file) carries a flat envelope.

const ENV = Object.values(import.meta.glob('./voice-env.json', { eager: true, import: 'default' }))[0] ?? { rate: 30, scale: 35, banks: {} };

export const decodeEnv = (s, scale = ENV.scale) => [...s].map((ch) => parseInt(ch, 36) / scale);

// c: the bark's play command; takeIndex and seconds: the take that sounds (takeIndex null for a placeholder).
export function voiceDetail(c, { emotion, takeIndex, seconds, startsIn, env = ENV }) {
  const bank = c.file.replace(/^voice\//, '');
  const s = takeIndex == null ? null : env.banks?.[bank]?.[emotion]?.[takeIndex];
  const n = Math.max(1, Math.round(seconds * env.rate));
  return {
    staffId: c.voiceKey,
    emotion,
    take: takeIndex,
    startsIn: Math.max(0, startsIn),
    seconds,
    rate: env.rate,
    loudness: s ? decodeEnv(s, env.scale) : Array(n).fill(0.6),
  };
}
