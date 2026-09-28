// Squads: named groups the player posts to work as a unit. Membership lives only on the squad; posting a
// squad dispatches each member's ordinary assignment, so every other system sees people, not squads.
import { B } from './balance.js';
import { newId } from './util.js';
import { registerAction } from './registry.js';
import { findStaff, tryAssign } from './staff.js';

const POSTINGS = new Set(['project', 'maintenance', 'support', 'idle']);
const LOCKED = 'Squads unlock with the Office Floor or 8 people';

export const squadOf = (state, staffId) => state.squads.find((sq) => sq.memberIds.includes(staffId)) ?? null;
const findSquad = (state, id) => state.squads.find((sq) => sq.id === id) ?? null;
const unlocked = (state) => state.officeStage >= 1 || state.staff.length >= B.squadUnlockStaff;
const cleanName = (name) => (typeof name === 'string' ? name.trim() : '');

function checkMembers(state, memberIds) {
  if (!Array.isArray(memberIds) || memberIds.length < 1 || memberIds.length > B.squadMaxMembers) return 'A squad has 1 to 8 people';
  if (new Set(memberIds).size !== memberIds.length) return 'A squad has 1 to 8 people';
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
      other.cohesion /= 2;
      if (other.leadId && !kept.includes(other.leadId)) other.leadId = null;
    }
  }
  const changed = memberIds.length !== before.size || memberIds.some((id) => !before.has(id));
  squad.memberIds = [...memberIds];
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
  if (!unlocked(state)) return { ok: false, reason: LOCKED };
  if (state.squads.length >= B.squadMax) return { ok: false, reason: `Up to ${B.squadMax} squads` };
  const n = cleanName(name);
  if (!n || n.length > 20) return { ok: false, reason: 'Name the squad' };
  const bad = checkMembers(state, memberIds);
  if (bad) return { ok: false, reason: bad };
  const squad = { id: newId(state, 'q'), name: n, memberIds: [], leadId: null, posting: { type: 'idle', targetId: null },
    afterLaunch: 'upkeep', benchUntil: null, cohesion: 0, formedWeek: state.week };
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
    const reason = postingBlocker(p, posting) ?? tryAssign(state, p, assignment);
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
  return { ok: true, placed, skipped };
});
