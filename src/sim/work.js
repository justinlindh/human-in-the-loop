import { B } from './balance.js';
import { outputMult, staffMods, STATS } from './staff.js';
import { registerSystem } from './registry.js';

export const zeroPoints = () => ({ features: 0, polish: 0, reliability: 0, novelty: 0 });

export function personPoints(state, person) {
  const mods = staffMods(person);
  const base = (B.basePoints + B.pointsPerLevel * person.level) * outputMult(state, person)
    * (person.assignment.type === 'mentor' ? B.mentorOutputMult : 1);
  const w = B.roleWeights[person.role];
  const out = zeroPoints();
  for (const st of STATS) out[st] = base * w[st] * (0.5 + person.skills[st] / 100) * mods[st];
  return out;
}

// Weekly engineering automation output, before it is split across projects.
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

// Fills ctx.weekPoints[projectId] and ctx.contributors[projectId] for the projects system,
// and writes this week's maintenance capacity.
export function workSystem(ctx) {
  const { state } = ctx;
  const weekPoints = {};
  const contributors = {};
  for (const j of state.projects) { weekPoints[j.id] = zeroPoints(); contributors[j.id] = []; }
  let maintenance = 0;
  const creative = state.projects.filter((j) => j.kind === 'new' || j.kind === 'update');

  for (const p of state.staff) {
    if (p.mood === 'away') continue;
    const t = p.assignment.type;
    if (t === 'project' && weekPoints[p.assignment.targetId]) {
      const pts = personPoints(state, p);
      addInto(weekPoints[p.assignment.targetId], pts);
      contributors[p.assignment.targetId].push({ staffId: p.id, pts });
    } else if (t === 'hardProblem' && creative.length) {
      const nov = B.hardProblemNovelty * outputMult(state, p) / creative.length;
      for (const j of creative) weekPoints[j.id].novelty += nov;
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
    for (const j of targets) addInto(weekPoints[j.id], auto, share);
  } else {
    maintenance += auto.features + auto.polish + auto.reliability + auto.novelty;
  }

  state.ops.maintenanceCapacity = maintenance;
  ctx.weekPoints = weekPoints;
  ctx.contributors = contributors;
}

registerSystem('work', workSystem, 20);
