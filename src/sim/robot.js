import { B } from './balance.js';
import { createRng, chance, pick } from './rng.js';
import { registerSystem } from './registry.js';
import { FUNCTIONS, newRobot } from './state.js';
import { automationExposure } from './automation.js';
import { raiseDecision } from './events.js';
import { emitChat } from './chat.js';
import { recordGrowth } from './progression.js';
import { ITEMS } from '../data/items.js';
import { ROBOT_LINES } from '../data/robot.js';

const L = ROBOT_LINES;
const ACCIDENTS = ['spin', 'stuck', 'emptyDesk'];
const SABOTAGE = ['cone', 'decaf', 'unplug'];
const first = (p) => p.name.split(' ')[0];
const here = (p) => p.mood !== 'away' && !p.remote;

export const robotItem = (state) => state.office.placed.find((p) => p.itemId === 'office_robot') ?? null;

// The mean automation level across every function: the share the Automation panel shows.
export const automationShare = (state) => FUNCTIONS.reduce((a, fn) => a + (state.automation[fn]?.level ?? 0), 0) / FUNCTIONS.length;

// How the staff feel about the robot at the company's automation share: 'fond', 'grumble' or 'sabotage'.
export function robotResentment(state) {
  const share = automationShare(state);
  return share >= B.robot.sabotageFrom ? 'sabotage' : share >= B.robot.grumbleFrom ? 'grumble' : 'fond';
}

// The meaningRecovery someone turns down by refusing the robot's coffee: once people grumble, anyone whose own
// job is mostly automated won't take it. 0 for everyone else.
export function robotRefusal(state, p) {
  const r = state.robot;
  const it = r && r.status === 'ok' ? robotItem(state) : null;
  if (!it || robotResentment(state) === 'fond' || automationExposure(state, p) < B.robot.refuseExposure) return 0;
  return ITEMS.office_robot.effects[it.level - 1]?.meaningRecovery ?? 0;
}

// A party or a blameless meeting: no sabotage for B.robot.calmWeeks.
export function calmRobot(state) {
  if (state.robot) state.robot.calmUntil = Math.max(state.robot.calmUntil ?? 0, state.week + B.robot.calmWeeks);
}

// The robot's own stream (seed, week, a salt), so a company without one plays exactly as before.
const stream = (state, salt) => createRng((Math.imul(state.seed >>> 0, 2654435761) + Math.imul(state.week, 2246822519) + Math.imul(salt, 3266489917) + 0x2b07) >>> 0);
const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

// Who slaps it back to life: someone with Percussive Maintenance first, then an engineer, then anyone in the office.
function fixerFor(state, rng) {
  const inRoom = state.staff.filter(here);
  const pro = inRoom.filter((p) => p.traits.includes('percussive'));
  if (pro.length) return pro[0];
  const engineers = inRoom.filter((p) => p.role === 'engineer');
  return engineers.length ? pick(rng, engineers) : inRoom.length ? pick(rng, inRoom) : null;
}

function fix(ctx, fixer, sameWeek) {
  const { state } = ctx;
  const r = state.robot;
  Object.assign(r, { status: 'ok', cause: null, since: null });
  ctx.emit({ type: 'robot', kind: 'fixed', fixerId: fixer.id, sameWeek });
  emitChat(ctx, { channel: 'random', person: fixer, text: fill(pick(stream(state, 5), sameWeek ? L.fixedFast : L.fixed), { fixer: first(fixer) }) });
  if (sameWeek) fixer.meaning = Math.min(100, fixer.meaning + B.robot.fixMeaning);
  const fixes = (state.flags.robotFixes ??= {});
  fixes[fixer.id] = (fixes[fixer.id] ?? 0) + 1;
  if (fixes[fixer.id] >= B.robot.fixesForTrait && !fixer.traits.includes('percussive') && fixer.traits.length < 3) {
    fixer.traits.push('percussive');
    ctx.emit({ type: 'traitEarned', staffId: fixer.id, traitId: 'percussive', source: 'record' });
    recordGrowth(state, fixer, 'trait', { traitId: 'percussive', source: 'record' });
  }
}

// What goes wrong this week, if anything: sabotage from the most automated person once resentment runs high,
// or an ordinary breakdown. Returns { cause, saboteur, desk } or null.
function trouble(state, level) {
  const r = state.robot;
  const share = automationShare(state);
  const R = B.robot;
  if (share >= R.sabotageFrom && !(r.calmUntil > state.week)) {
    const p = R.sabotageChance * (share - R.sabotageFrom) / (1 - R.sabotageFrom) * (r.googly ? R.googlyMult : 1);
    const saboteur = state.staff.filter((x) => here(x) && !x.founder).sort((a, b) => automationExposure(state, b) - automationExposure(state, a) || (a.id < b.id ? -1 : 1))[0];
    if (saboteur && chance(stream(state, 1), p)) return { cause: pick(stream(state, 2), SABOTAGE), saboteur, desk: null };
  }
  if (!chance(stream(state, 3), R.breakChance * (level >= 3 ? R.l3BreakMult : 1))) return null;
  const rng = stream(state, 4);
  const cause = pick(rng, ACCIDENTS);
  if (cause !== 'emptyDesk') return { cause, saboteur: null, desk: null };
  const away = state.staff.filter((p) => p.mood === 'away' && p.deskId);
  return away.length ? { cause, saboteur: null, desk: pick(rng, away) } : { cause: 'spin', saboteur: null, desk: null };
}

function chatter(ctx) {
  const { state } = ctx;
  const mood = robotResentment(state);
  const lines = mood === 'fond' ? L.fond : L.grumble;
  if (!chance(stream(state, 6), mood === 'fond' ? B.robot.fondChat : B.robot.grumbleChat)) return;
  const rng = stream(state, 7);
  const people = state.staff.filter((p) => p.mood !== 'away' && !p.founder);
  if (people.length < 2) return;
  const [who, other] = [pick(rng, people), pick(rng, people)];
  const coworker = other === who ? people.find((p) => p !== who) : other;
  emitChat(ctx, { channel: 'random', person: who, text: fill(pick(rng, lines), { coworker: first(coworker) }) });
}

export function robotSystem(ctx) {
  const { state } = ctx;
  const it = robotItem(state);
  if (!it) return;
  const r = (state.robot ??= newRobot());
  if (r.status === 'broken') {
    const fixer = state.week > r.since ? fixerFor(state, stream(state, 8)) : null;
    if (fixer) fix(ctx, fixer, false);
  } else {
    const t = trouble(state, it.level);
    if (t) {
      Object.assign(r, { status: 'broken', cause: t.cause, since: state.week });
      r.breakdowns++;
      if (t.saboteur) {
        r.sabotages++;
        state.flags.robotKickDue ??= true;
      }
      ctx.emit({ type: 'robot', kind: 'breakdown', cause: t.cause, staffId: t.saboteur?.id ?? null, deskStaffId: t.desk?.id ?? null });
      const poster = state.staff.filter((p) => p.mood !== 'away' && p !== t.saboteur && p !== t.desk);
      if (poster.length) emitChat(ctx, { channel: 'random', person: pick(stream(state, 9), poster), text: fill(pick(stream(state, 10), L.breakdown[t.cause]), { name: t.desk ? first(t.desk) : '' }) });
      const pro = state.staff.find((p) => here(p) && p.traits.includes('percussive'));
      if (pro) fix(ctx, pro, true);
    } else chatter(ctx);
  }
  // The first sabotage asks who kicked the robot, once, when a decision has room.
  if (state.flags.robotKickDue === true && !state.pendingDecision && raiseDecision(ctx, 'robot_kicked', null)) state.flags.robotKickDue = false;
}

registerSystem('robot', robotSystem, 67);
