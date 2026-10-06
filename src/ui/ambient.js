// Status news that leaves the toast stack under quietToasts. It becomes a cancelable window event the
// renderer can draw over the subject (a desk bubble or floating text). The renderer claims an event with
// preventDefault(); an unclaimed one comes back to the caller, which toasts it as before.
import { pnow } from './pclock.js';

// What a status toast's `topic` means for the world: the icon id and the short text a bubble carries.
const TOPICS = {
  progress: { icon: 'progress', kind: 'project', short: (e) => e.short ?? 'Making progress' },
  timeoff: { icon: 'vacation', kind: 'staff', short: (e) => e.short ?? 'Off for a bit' },
  back: { icon: 'vacation', kind: 'staff', short: (e) => e.short ?? 'Back!' },
  mood: { icon: 'tired', kind: 'staff', short: (e) => e.short ?? 'Running low' },
  trend: { icon: 'trend', kind: 'company', short: (e) => e.short ?? 'New trend' },
  blocked: { icon: 'shield', kind: 'company', short: (e) => e.short ?? 'Attack blocked' },
  reward: { icon: 'award', kind: 'staff', short: (e) => e.short ?? 'Nice work' },
  pet: { icon: 'pet', kind: 'company', short: (e) => e.short ?? 'New office pet' },
  rival: { icon: 'rival', kind: 'company', short: (e) => e.short ?? 'Rival news' },
  incident: { icon: 'warn', kind: 'product', short: (e) => e.short ?? 'Small outage' },
};
export const AMBIENT_TOPICS = Object.keys(TOPICS);
const MERGE_MS = 15000;
export const SHORT_MAX = 32;

const clip = (s) => (s.length > SHORT_MAX ? `${s.slice(0, SHORT_MAX - 1)}…` : s);

// The detail art receives for a toast event that carries a status topic, or null when it carries none.
export function ambientDetail(e) {
  const t = TOPICS[e?.topic];
  if (!t) return null;
  return { topic: e.topic, subjectId: e.subjectId ?? null, subjectKind: t.kind, text: clip(String(t.short(e))), icon: t.icon, tone: e.tone ?? 'info' };
}

export function createAmbient({ target = globalThis } = {}) {
  const last = new Map(); // `${topic}:${subject}` -> presentation time
  // Returns true when the news was handled (drawn, or merged into one just shown); false when the caller
  // should toast it instead.
  function send(e) {
    const detail = ambientDetail(e);
    if (!detail || typeof CustomEvent !== 'function' || !target?.dispatchEvent) return false;
    const key = `${detail.topic}:${detail.subjectId ?? ''}`;
    const now = pnow();
    if (last.has(key) && now - last.get(key) < MERGE_MS) return true;
    const ev = new CustomEvent('hitl:ambient', { detail, cancelable: true });
    const unclaimed = target.dispatchEvent(ev);
    if (unclaimed) return false;
    last.set(key, now);
    if (last.size > 200) last.delete(last.keys().next().value);
    return true;
  }
  return { send };
}
