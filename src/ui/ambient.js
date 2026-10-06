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
  replyall: { icon: 'mail', kind: 'company', short: (e) => e.short ?? 'Reply-all storm' },
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
  function send(e) { return sendDetail(ambientDetail(e)); }
  function sendDetail(detail) {
    if (!detail || typeof CustomEvent !== 'function' || !target?.dispatchEvent) return false;
    // An incident and its all-clear are different news about the same product.
    const key = `${detail.topic}:${detail.subjectId ?? ''}${detail.topic === 'incident' ? `:${detail.text}` : ''}`;
    const now = pnow();
    if (last.has(key) && now - last.get(key) < MERGE_MS) return true;
    const ev = new CustomEvent('hitl:ambient', { detail, cancelable: true });
    const unclaimed = target.dispatchEvent(ev);
    if (unclaimed) return false;
    last.set(key, now);
    if (last.size > 200) last.delete(last.keys().next().value);
    return true;
  }
  return { send, sendDetail };
}

// A product update shipping: "v3: 8.4" over the product's team, warn when the score fell by more than half a point.
export function shippedDetail(p, prevScore) {
  const fell = prevScore !== undefined && prevScore - p.score > 0.5;
  return { topic: 'shipped', subjectId: p.id, subjectKind: 'product', text: clip(`v${p.version}: ${p.score.toFixed(1)}`), icon: 'launch', tone: fell ? 'warn' : 'good' };
}

// A card-less gag (`quietEvent`): a short caption and glyph per event, and a generic one for the rest.
const GAGS = {
  ping_pong: ['Ping-pong!', 'item.ping_pong_table'],
  printer_jam: ['Printer jammed', 'warn'],
  pet_mishap: ['Cable chewed', 'pet'],
  conference_expo: ['Off to the expo', 'channel.conference'],
  ai_summit: ['AI summit trip', 'channel.conference'],
};
export function gagDetail(e, state) {
  const [text, icon] = GAGS[e.eventId] ?? ['Office moment', 'idea'];
  const id = e.subjectId ?? null;
  const subjectKind = id == null ? 'company' : (state?.products ?? []).some((p) => p.id === id) ? 'product' : 'staff';
  return { topic: 'gag', subjectId: id, subjectKind, text, icon, tone: 'info' };
}

// Minor incidents (severity below 3, the SEV4 and SEV5 ones) and their all-clear go to the world instead of a toast.
export const MINOR_SEVERITY = 3;
export function incidentDetail(e) {
  if (!(e.severity < MINOR_SEVERITY)) return null;
  const common = { topic: 'incident', subjectId: e.productId ?? null, subjectKind: 'product' };
  if (e.type === 'incidentResolved') return { ...common, text: 'All clear', icon: 'check', tone: 'good' };
  if (e.caught) return { ...common, text: 'Caught early', icon: 'shield', tone: 'good' };
  return { ...common, text: `SEV${6 - e.severity}`, icon: 'warn', tone: 'bad' };
}
