// People's growth as the UI remembers it: a short timeline per person from this session's growth
// events (levelUp, promoted, traitEarned, skillTrained), and what grew since you last opened their
// card. State has no dated history, so a loaded game starts each timeline at "joined".
import { traitInfo } from './content.js';

const KEEP = 12; // timeline entries per person
const SKILL = { features: 'Features', polish: 'Polish', reliability: 'Reliability', novelty: 'Freshness' };
const RANK = { mid: 'Mid-level', senior: 'Senior' };

export const skillName = (k) => SKILL[k] ?? k;
export const seniorityName = (k) => RANK[k] ?? k;

export function createGrowth() {
  const log = new Map();   // staffId -> [{ week, kind, text }]
  const unseen = new Map(); // staffId -> { levels, gains: {skill: n}, promoted, traits: [] }

  const bucket = (id) => { if (!unseen.has(id)) unseen.set(id, { levels: 0, gains: {}, promoted: null, traits: [] }); return unseen.get(id); };
  function note(id, entry) {
    const l = log.get(id) ?? [];
    l.push(entry);
    if (l.length > KEEP) l.shift();
    log.set(id, l);
  }

  // Records a batch of events; returns one summary per person for the batch, for toasts.
  function add(events, week) {
    const people = new Map();
    const of = (id) => { if (!people.has(id)) people.set(id, { staffId: id, level: null, gains: {}, promoted: null, traits: [], trained: [] }); return people.get(id); };
    for (const e of events) {
      if (!e?.staffId) continue;
      const u = bucket(e.staffId);
      const b = of(e.staffId);
      if (e.type === 'levelUp') {
        u.levels++; b.level = e.level;
        for (const [k, n] of Object.entries(e.gains ?? {})) { u.gains[k] = (u.gains[k] ?? 0) + n; b.gains[k] = (b.gains[k] ?? 0) + n; }
        note(e.staffId, { week, kind: 'level', text: `Level ${e.level}` });
      } else if (e.type === 'promoted') {
        u.promoted = e.seniority; b.promoted = e.seniority;
        note(e.staffId, { week, kind: 'promoted', text: `Promoted to ${seniorityName(e.seniority)}` });
      } else if (e.type === 'traitEarned') {
        const name = traitInfo(e.traitId).name;
        u.traits.push(name); b.traits.push(name);
        note(e.staffId, { week, kind: 'trait', text: `Earned ${name}` });
      } else if (e.type === 'skillTrained') {
        u.gains[e.skill] = (u.gains[e.skill] ?? 0) + (e.gain ?? 0);
        b.trained.push(`${skillName(e.skill)} +${e.gain}`);
        note(e.staffId, { week, kind: 'trained', text: `Trained ${skillName(e.skill)} +${e.gain}` });
      }
    }
    return [...people.values()];
  }

  return {
    add,
    timeline: (id) => [...(log.get(id) ?? [])].reverse(),
    unseen: (id) => unseen.get(id) ?? null,
    hasUnseen: (id) => { const u = unseen.get(id); return !!u && (u.levels > 0 || u.promoted || u.traits.length > 0 || Object.keys(u.gains).length > 0); },
    markSeen: (id) => unseen.delete(id),
    reset: () => { log.clear(); unseen.clear(); },
  };
}

// The toast line for one person's batch, or null when it's only level-ups (those stay quiet).
//   promoted:     "Priya is now a Senior Engineer. Polish +3, earned Night Owl."
//   levelled up:  "Priya levelled up. Earned Night Owl."
//   trained:      "Priya finished training: Reliability +5."
//   a trait:      "Priya earned Night Owl."
export function growthToast(name, b, role = '') {
  if (!b.promoted && !b.traits.length && !b.trained.length) return null;
  const cap = (t) => t.replace(/^./, (c) => c.toUpperCase());
  const gains = Object.entries(b.gains).filter(([, n]) => n > 0).map(([k, n]) => `${skillName(k)} +${Math.round(n)}`);
  const earned = b.traits.map((t) => `earned ${t}`);
  if (b.promoted) {
    const bits = [...gains, ...earned];
    return `${name} is now a ${b.promoted === 'mid' ? 'Mid' : 'Senior'}${role ? ` ${role}` : ''}.${bits.length ? ` ${cap(bits.join(', '))}.` : ''}`;
  }
  if (b.level) return `${name} levelled up. ${cap([...b.trained, ...earned].join(', '))}.`;
  if (b.trained.length) return `${name} finished training: ${[...b.trained, ...earned].join(', ')}.`;
  return `${name} earned ${b.traits.join(' and ')}.`;
}
