import { B } from './balance.js';
import { outputMult, staffMods, STATS } from './staff.js';
import { registerSystem } from './registry.js';

export const zeroPoints = () => ({ features: 0, polish: 0, reliability: 0, novelty: 0 });

// Raw weekly effort per stat: drives project progress. Skill does not speed work up.
export function personEffort(state, person) {
  const base = (B.basePoints + B.pointsPerLevel * person.level) * outputMult(state, person)
    * (person.assignment.type === 'mentor' ? B.mentorOutputMult : 1);
  const w = B.roleWeights[person.role];
  const out = zeroPoints();
  for (const st of STATS) out[st] = base * w[st];
  return out;
}

// How much quality one point of effort carries for this person in this stat.
export function skillFactor(person, stat, mods = staffMods(person)) {
  return (B.qualityBase + person.skills[stat] / 100) * mods[stat];
}

// Quality points per week: effort weighted by skill. These accumulate into project stats.
export function personPoints(state, person) {
  const mods = staffMods(person);
  const effort = personEffort(state, person);
  const out = zeroPoints();
  for (const st of STATS) out[st] = effort[st] * skillFactor(person, st, mods);
  return out;
}

// Quality per point of automation effort, from the engineering model's capability.
export function automationQuality(state) {
  const a = state.automation.engineering;
  return B.autoQualityBase + B.autoQualityPerCap * state.models[a.model].capability / 100;
}

// Weekly engineering automation effort, before it is split across projects.
export function automationPoints(state) {
  const a = state.automation.engineering;
  const out = zeroPoints();
  if (a.level <= 0) return out;
  const cap = state.models[a.model].capability / 100;
  const total = B.autoEngPoints * a.level * cap * (state.policies.pair ? B.pairAutoMult : 1);
  for (const st of STATS) out[st] = total * B.autoEngWeights[st];
  return out;
}

const AUTOMATABLE = new Set(['new', 'update', 'migration']);
const addInto = (into, pts, mult = 1) => { for (const st of STATS) into[st] += pts[st] * mult; };

// Fills ctx.weekEffort, ctx.weekStats, and ctx.contributors (keyed by project id) for the
// projects system, and writes this week's maintenance capacity.
export function workSystem(ctx) {
  const { state } = ctx;
  const weekEffort = {};
  const weekStats = {};
  const contributors = {};
  for (const j of state.projects) { weekEffort[j.id] = zeroPoints(); weekStats[j.id] = zeroPoints(); contributors[j.id] = []; }
  let maintenance = 0;
  const creative = state.projects.filter((j) => j.kind === 'new' || j.kind === 'update');

  for (const p of state.staff) {
    if (p.mood === 'away') continue;
    const t = p.assignment.type;
    if (t === 'project' && weekEffort[p.assignment.targetId]) {
      const id = p.assignment.targetId;
      const pts = personPoints(state, p);
      addInto(weekEffort[id], personEffort(state, p));
      addInto(weekStats[id], pts);
      contributors[id].push({ staffId: p.id, pts });
    } else if (t === 'hardProblem' && creative.length) {
      const nov = B.hardProblemNovelty * outputMult(state, p) / creative.length;
      for (const j of creative) {
        weekEffort[j.id].novelty += nov;
        weekStats[j.id].novelty += nov * skillFactor(p, 'novelty');
      }
    } else if (p.role === 'engineer' && (t === 'maintenance' || t === 'mentor')) {
      const pts = personPoints(state, p);
      maintenance += pts.features + pts.reliability;
    }
  }

  const auto = automationPoints(state);
  const targets = state.projects.filter((j) => AUTOMATABLE.has(j.kind));
  if (targets.length) {
    const n = targets.length;
    const share = (1 + 0.5 * (n - 1)) / n;
    const q = automationQuality(state);
    for (const j of targets) {
      addInto(weekEffort[j.id], auto, share);
      addInto(weekStats[j.id], auto, share * q);
    }
  } else {
    maintenance += auto.features + auto.polish + auto.reliability + auto.novelty;
  }

  state.ops.maintenanceCapacity = maintenance;
  ctx.weekEffort = weekEffort;
  ctx.weekStats = weekStats;
  ctx.contributors = contributors;
}

registerSystem('work', workSystem, 20);
