// Squads: named groups the player posts to work as a unit. Membership lives only on the squad; posting a
// squad dispatches each member's ordinary assignment, so every other system sees people, not squads.
import { B } from './balance.js';
import { newId } from './util.js';
import { registerAction, registerSystem } from './registry.js';
import { isUnlocked } from './unlocks.js';
import { findStaff, tryAssign, defaultAssignment } from './staff.js';
import { personPoints } from './work.js';

const POSTINGS = new Set(['project', 'maintenance', 'support', 'idle']);

export const squadOf = (state, staffId) => state.squads.find((sq) => sq.memberIds.includes(staffId)) ?? null;
const findSquad = (state, id) => state.squads.find((sq) => sq.id === id) ?? null;
const ready = (state) => state.officeStage >= 1 || state.staff.length >= B.squadUnlockStaff;
const lockedText = () => `Squads unlock with the Office Floor or ${B.squadUnlockStaff} people`;

// Squads unlock the first week the company is ready, silently, and stay unlocked after that.
function unlocked(state) {
  if (!isUnlocked(state, 'squads') && ready(state)) state.unlocks.squads = state.week;
  return isUnlocked(state, 'squads');
}
const cleanName = (name) => (typeof name === 'string' ? name.trim() : '');

const membersText = () => `A squad has 1 to ${B.squadMaxMembers} people`;

function checkMembers(state, memberIds) {
  if (!Array.isArray(memberIds) || memberIds.length < 1 || memberIds.length > B.squadMaxMembers) return membersText();
  if (new Set(memberIds).size !== memberIds.length) return membersText();
  if (memberIds.some((id) => !findStaff(state, id))) return 'No such staff member';
  return null;
}

// Makes memberIds the squad's members: anyone joining leaves their old squad, and any squad that gains or
// loses someone loses half its cohesion.
function setMembers(state, squad, memberIds) {
  const before = new Set(squad.memberIds);
  for (const other of state.squads) {
    if (other === squad) continue;
    const kept = other.memberIds.filter((id) => !memberIds.includes(id));
    if (kept.length !== other.memberIds.length) {
      other.memberIds = kept;
      other.crewIds = other.crewIds.filter((id) => kept.includes(id));
      other.cohesion /= 2;
      if (other.leadId && !kept.includes(other.leadId)) other.leadId = null;
    }
  }
  const changed = memberIds.length !== before.size || memberIds.some((id) => !before.has(id));
  squad.memberIds = [...memberIds];
  squad.crewIds = squad.crewIds.filter((id) => memberIds.includes(id));
  if (changed) squad.cohesion /= 2;
  if (squad.leadId && !memberIds.includes(squad.leadId)) squad.leadId = null;
}

// Why a member can't take a posting, or null. Maintenance is engineering work; the rest follow assign's rules.
function postingBlocker(person, posting) {
  if (posting.type === 'maintenance' && person.role !== 'engineer') return 'Only engineers do maintenance';
  return null;
}

registerAction('createSquad', (ctx, { name, memberIds }) => {
  const { state } = ctx;
  if (!unlocked(state)) return { ok: false, reason: lockedText() };
  if (state.squads.length >= B.squadMax) return { ok: false, reason: `Up to ${B.squadMax} squads` };
  const n = cleanName(name);
  if (!n || n.length > 20) return { ok: false, reason: 'Name the squad' };
  const bad = checkMembers(state, memberIds);
  if (bad) return { ok: false, reason: bad };
  const squad = { id: newId(state, 'q'), name: n, memberIds: [], leadId: null, posting: { type: 'idle', targetId: null },
    afterLaunch: 'upkeep', benchUntil: null, cohesion: 0, formedWeek: state.week, crewIds: [] };
  state.squads.push(squad);
  setMembers(state, squad, memberIds);
  return { ok: true, squadId: squad.id };
});

registerAction('renameSquad', (ctx, { squadId, name }) => {
  const squad = findSquad(ctx.state, squadId);
  if (!squad) return { ok: false, reason: 'No such squad' };
  const n = cleanName(name);
  if (!n || n.length > 20) return { ok: false, reason: 'Name the squad' };
  squad.name = n;
  return { ok: true };
});

registerAction('disbandSquad', (ctx, { squadId }) => {
  const { state } = ctx;
  if (!findSquad(state, squadId)) return { ok: false, reason: 'No such squad' };
  state.squads = state.squads.filter((sq) => sq.id !== squadId);
  return { ok: true };
});

registerAction('setSquadMembers', (ctx, { squadId, memberIds }) => {
  const { state } = ctx;
  const squad = findSquad(state, squadId);
  if (!squad) return { ok: false, reason: 'No such squad' };
  const bad = checkMembers(state, memberIds);
  if (bad) return { ok: false, reason: bad };
  setMembers(state, squad, memberIds);
  return { ok: true };
});

registerAction('setSquadLead', (ctx, { squadId, staffId }) => {
  const squad = findSquad(ctx.state, squadId);
  if (!squad) return { ok: false, reason: 'No such squad' };
  if (staffId !== null && !squad.memberIds.includes(staffId)) return { ok: false, reason: 'Not in this squad' };
  squad.leadId = staffId;
  return { ok: true };
});

registerAction('setSquadAfterLaunch', (ctx, { squadId, mode }) => {
  const squad = findSquad(ctx.state, squadId);
  if (!squad) return { ok: false, reason: 'No such squad' };
  if (mode !== 'upkeep' && mode !== 'maintenance') return { ok: false, reason: 'Unknown mode' };
  squad.afterLaunch = mode;
  return { ok: true };
});

// Posts every member who can take the work; the rest keep what they were doing.
export function postSquad(state, squad, posting) {
  const placed = [];
  const skipped = [];
  const assignment = { type: posting.type, targetId: posting.type === 'project' ? posting.targetId : null };
  for (const id of squad.memberIds) {
    const p = findStaff(state, id);
    const crew = posting.type !== 'maintenance' && squad.crewIds.includes(id) ? 'On upkeep crew' : null;
    const reason = crew ?? postingBlocker(p, posting) ?? tryAssign(state, p, assignment);
    if (reason) skipped.push({ staffId: id, reason });
    else placed.push(id);
  }
  return { placed, skipped };
}

registerAction('postSquad', (ctx, { squadId, posting }) => {
  const { state } = ctx;
  const squad = findSquad(state, squadId);
  if (!squad) return { ok: false, reason: 'No such squad' };
  if (!posting || !POSTINGS.has(posting.type)) return { ok: false, reason: 'Unknown posting' };
  if (posting.type === 'project' && !state.projects.some((j) => j.id === posting.targetId)) return { ok: false, reason: 'No such project' };
  if (!squad.memberIds.length) return { ok: false, reason: 'The squad is empty' };
  const { placed, skipped } = postSquad(state, squad, posting);
  if (!placed.length) return { ok: false, reason: skipped[0].reason, placed, skipped };
  squad.posting = { type: posting.type, targetId: posting.type === 'project' ? posting.targetId : null };
  squad.benchUntil = null;
  if (posting.type === 'maintenance') squad.crewIds = [];
  return { ok: true, placed, skipped };
});

// Working the squad's posting, or looking after a product as its upkeep crew.
const onPosting = (squad, p) => p.mood !== 'away' && ((squad.crewIds.includes(p.id) && p.assignment.type === 'maintenance')
  || (squad.posting.type !== 'idle' && p.assignment.type === squad.posting.type
    && (squad.posting.type !== 'project' || p.assignment.targetId === squad.posting.targetId)));

// The output bonus a person gets from their squad's cohesion while working its posting.
export function squadOutputBonus(state, person) {
  for (const sq of state.squads ?? []) {
    if (sq.cohesion > 0 && sq.memberIds.includes(person.id)) return onPosting(sq, person) ? sq.cohesion * B.squadCohesionOutput : 0;
  }
  return 0;
}

// Called when a project finishes, after its team went back to their default work. A squad posted to a new
// product keeps an upkeep crew on it (the engineers who know most, enough to cover its maintenance) and
// benches the rest; after an update, migration or internal project the whole squad is benched, since the
// product already has its upkeep. With afterLaunch 'maintenance' everyone keeps their default work.
export function squadsAfterProject(ctx, project, team, product) {
  const { state } = ctx;
  for (const sq of state.squads ?? []) {
    if (sq.posting.type !== 'project' || sq.posting.targetId !== project.id) continue;
    const mine = team.filter((p) => sq.memberIds.includes(p.id));
    if (sq.afterLaunch === 'maintenance') {
      sq.posting = { type: 'maintenance', targetId: null };
      continue;
    }
    const crew = [];
    if (product && project.kind === 'new') {
      const need = B.maintenancePerProduct + product.customers * B.maintenancePerCustomer;
      let covered = 0;
      for (const p of mine.filter((x) => x.role === 'engineer').sort((a, b) => b.knowledge - a.knowledge)) {
        if (crew.length && covered >= need) break;
        crew.push(p);
        const pts = personPoints(state, p);
        covered += pts.features + pts.reliability;
      }
    }
    for (const p of mine) p.assignment = crew.includes(p) ? { type: 'maintenance', targetId: null } : { type: 'idle', targetId: null };
    sq.crewIds = [...new Set([...sq.crewIds, ...crew.map((p) => p.id)])];
    sq.posting = { type: 'idle', targetId: null };
    sq.benchUntil = state.week + B.squadBenchWeeks;
    ctx.emit({ type: 'squadFreed', squadId: sq.id, productId: product?.id ?? null, crewIds: crew.map((p) => p.id) });
  }
}

// Weekly: records the unlock, benches run out, cohesion builds for squads working their posting, and idle
// spells are timed for the advisors.
export function squadsSystem(ctx) {
  const { state } = ctx;
  unlocked(state);
  const idleSince = (state.flags.squadIdleSince ??= {});
  for (const sq of state.squads) {
    const members = sq.memberIds.map((id) => findStaff(state, id)).filter(Boolean);
    // Someone moved off maintenance by hand has left the crew.
    sq.crewIds = sq.crewIds.filter((id) => findStaff(state, id)?.assignment.type === 'maintenance');
    if (sq.benchUntil !== null && state.week >= sq.benchUntil) {
      for (const p of members) if (p.assignment.type === 'idle' && p.mood !== 'away') p.assignment = defaultAssignment(p);
      sq.benchUntil = null;
      sq.posting = { type: members.some((p) => p.role === 'engineer') ? 'maintenance' : 'idle', targetId: null };
      ctx.emit({ type: 'squadBenchEnded', squadId: sq.id });
    }
    const working = members.filter((p) => onPosting(sq, p)).length;
    if (members.length && working * 2 >= members.length) sq.cohesion = Math.min(1, sq.cohesion + 1 / B.squadCohesionWeeks);
    const idle = members.length > 0 && sq.posting.type === 'idle' && sq.benchUntil === null;
    if (!idle) delete idleSince[sq.id];
    else idleSince[sq.id] ??= state.week;
  }
  for (const id of Object.keys(idleSince)) if (!state.squads.some((sq) => sq.id === id)) delete idleSince[id];
}

registerSystem('squads', squadsSystem, 32);
