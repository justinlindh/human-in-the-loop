import { B } from '../sim/balance.js';
import { holdSeconds } from './reading.js';

// Status news drawn in the world (ui's cancelable 'hitl:ambient' event): a bubble over the person
// or the desk it is about, or a floating label over the room for company news. The renderer claims
// an event (preventDefault) only when it draws it; anything unclaimed stays a toast in ui.

// ui's ambient icon ids, as the glyph each one draws with.
export const AMBIENT_ICON = {
  progress: 'tray.project', vacation: 'sabbatical', tired: 'battery.low', trend: 'tray.trend',
  shield: 'security', award: 'award', rival: 'react.eyes', pet: 'react.dog', warn: 'warn', check: 'check',
};
const TONE_ICON = { info: 'toast.info', good: 'toast.good', warn: 'toast.warn', bad: 'toast.bad' };

export const deskBubblesOn = (balance = B) => balance.pacing?.deskBubbles ?? true;

// The 'hitl:ambient' handler: with the switch off it never claims; on, it claims what `draw` drew.
export const ambientListener = (draw, enabled = deskBubblesOn) => (ev) => {
  if (enabled() && draw(ev.detail)) ev.preventDefault();
};

// An unknown icon id draws its tone's glyph.
export const ambientGlyph = (icon, tone) => AMBIENT_ICON[icon] ?? TONE_ICON[tone] ?? TONE_ICON.info;

// How long a bubble stays: a speech line's hold for its text plus a beat to notice it. An
// all-clear check is a short beat.
export const CHECK_S = 2.5;
export const ambientSeconds = (text, speed = 1, icon = null) =>
  icon === 'check' ? CHECK_S : holdSeconds(text || 'x', speed) + 1.5;

// The people whose place carries a staff, project or product's news, best first: the person
// themself; a project's team; a product's owner, then whoever works on it or on a project for it.
// Company news (and anything with no subject) has none: it floats over the room.
export function ambientCarriers(detail, state) {
  const kind = detail?.subjectKind, id = detail?.subjectId;
  if (!id || kind === 'company') return [];
  const staff = state?.staff ?? [];
  if (kind === 'staff') return staff.some((s) => s.id === id) ? [id] : [];
  const out = [];
  const add = (s) => { if (s && !out.includes(s.id)) out.push(s.id); };
  if (kind === 'product') add(staff.find((s) => s.id === state?.products?.find((p) => p.id === id)?.ownerId));
  for (const s of staff) if (s.assignment?.targetId === id) add(s);
  if (kind === 'product') {
    const projects = new Set((state?.projects ?? []).filter((p) => p.productId === id).map((p) => p.id));
    for (const s of staff) if (projects.has(s.assignment?.targetId)) add(s);
  }
  return out;
}
