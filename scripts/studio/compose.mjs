// A compose file: a small JSON description of a scene (furniture at tiles, people, the office robot) that
// compiles to what the scene engine loads, with no save or seeded game needed.
//
//   node compose.mjs <file> [--json]   print the compiled scene (--json: the whole { state, script })
//   compose(fileOrObject) -> { state, script }
//     state   a game state (the mock sim's, with the office, staff and robot replaced): the engine's
//             `openScene({ state })` takes it as is.
//     script  what a game state cannot say, applied by the runtime after each step (`applyScript`), through
//             the game's own character and robot calls:
//               { frame, who, op: 'place',   at: [x, y], dir: [dx, dy] }   stand at a tile position, facing a direction
//               { frame, who, op: 'place',   at: [x, y], toward: 'robot' }  ... or facing the robot where it rests (the runtime aims)
//               { frame, who, op: 'gesture', name }                        play a gesture or pose
//
// The file:
//   base     mock scenario the state starts from: it fixes the office stage (default "floor")
//   items    [{ item, at: [x, y], rot?, level?, id? }]   tiles, the game's item ids, footprints and placement rules
//   people   [{ id, build?, seat? | at?, face?, gesture?, t?, look? }]
//              seat    the id of a desk in items: sits there (the desk decides the facing)
//              at      standing tile position [x, y] (fractions allowed), with face: north|east|south|west, a
//                      degree (0 = south, +y; 90 = east, +x), another person's id, or "robot"
//              free    true: allow standing inside an item's footprint (to look at what overlaps)
//              gesture played from t seconds (default 0)
//   era      the era the state is in (items arrive with eras; the office robot needs agents)
//   keep     ["office", "staff"]: keep the base's furniture and people (items and people add to them)
//   moments  [{ moment: "slap", fixer?: id | "nearest" }]   the game's own staging plays it: the robot's fix event
//                                    runs at frame 0 and the game picks the spot and walks the fixer (default: the
//                                    person nearest the robot). Needs a robot.
//   robot    { at: [x, y], cause?, level? }   the office robot; a cause (spin, stuck, emptyDesk, cone, decaf, unplug)
//                                    leaves it broken down that way
// Tile axes: +x east, +y south (a desk at rotation 0 faces +y).
import { readFileSync } from 'node:fs';
import { createMockSim } from '../../src/dev/mockSim.js';
import { ITEMS } from '../../src/data/items.js';
import { placementCheck, seatTile, footprintCells } from '../../src/sim/office.js';
import { ANIMS } from '../../src/render/character.js';
import { newRobot } from '../../src/sim/state.js';
import { officeShape } from '../../src/data/office.js';
import { ERA_IDS } from '../../src/data/eras.js';

export const CAUSES = ['spin', 'stuck', 'emptyDesk', 'cone', 'decaf', 'unplug'];
const BASES = ['garage', 'floor', 'hq', 'incident', 'night', 'ending'];
const COMPASS = { south: [0, 1], east: [1, 0], north: [0, -1], west: [-1, 0] };
const FPS = 30;
const APART = 0.4;   // tiles between two standing people

export class ComposeError extends Error {
  constructor(problems) {
    super(`compose: ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n- ${problems.join('\n- ')}`);
    this.problems = problems;
  }
}

const isPoint = (v) => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite);
const clone = (o) => JSON.parse(JSON.stringify(o));
const MOMENTS = ['slap'];
const KEEP = ['office', 'staff'];
const KEYS = { top: ['base', 'era', 'keep', 'items', 'people', 'robot', 'moments'], item: ['item', 'at', 'rot', 'level', 'id'], person: ['id', 'build', 'seat', 'at', 'face', 'gesture', 't', 'look', 'free'], robot: ['at', 'cause', 'level'], moment: ['moment', 'fixer'] };

function unknownKeys(obj, allowed, where, problems) {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) problems.push(`${where}: unknown key "${k}" (allowed: ${allowed.join(', ')})`);
}

export function compose(input) {
  const spec = typeof input === 'string' ? JSON.parse(readFileSync(input, 'utf8')) : input;
  const problems = [];
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new ComposeError(['the file must be an object']);
  unknownKeys(spec, KEYS.top, 'file', problems);
  const baseName = spec.base ?? 'floor';
  if (!BASES.includes(baseName)) problems.push(`base "${baseName}" is not one of ${BASES.join(', ')}`);
  const items = spec.items ?? [], people = spec.people ?? [];
  if (!Array.isArray(items)) problems.push('items must be a list');
  if (!Array.isArray(people)) problems.push('people must be a list');
  if (problems.length) throw new ComposeError(problems);

  const state = clone(createMockSim({ scenario: baseName, seed: 7 }).state);
  if (spec.era != null) {
    if (!ERA_IDS.includes(spec.era)) throw new ComposeError([`era "${spec.era}" is not one of ${ERA_IDS.join(', ')}`]);
    state.era = { ...state.era, id: spec.era };
  }
  const keep = spec.keep ?? [];
  if (!Array.isArray(keep) || keep.some((k) => !KEEP.includes(k))) throw new ComposeError([`keep must be a list of ${KEEP.join(', ')}`]);
  if (!keep.includes('office')) state.office.placed = [];
  if (!keep.includes('staff')) state.staff = [];
  state.cash = 1e9;
  const check = (entry, where) => {
    const r = placementCheck(state, { itemId: entry.itemId, x: entry.x, y: entry.y, rot: entry.rot });
    if (!r.ok) problems.push(`${where}: ${entry.itemId} at ${entry.x},${entry.y} rot ${entry.rot}: ${r.reason}`);
    else state.office.placed.push(entry);
  };

  const ids = new Set(state.office.placed.map((p) => p.id));
  items.forEach((it, i) => {
    const where = `items[${i}]`;
    unknownKeys(it, KEYS.item, where, problems);
    if (!ITEMS[it.item]) return problems.push(`${where}: unknown item "${it.item}"`);
    if (!isPoint(it.at)) return problems.push(`${where}: at must be [x, y] tiles`);
    const rot = it.rot ?? 0;
    if (![0, 1, 2, 3].includes(rot)) return problems.push(`${where}: rot must be 0 to 3`);
    const id = it.id ?? `i${i + 1}`;
    if (ids.has(id)) return problems.push(`${where}: duplicate id "${id}"`);
    ids.add(id);
    check({ id, level: it.level ?? 1, itemId: it.item, x: it.at[0], y: it.at[1], rot }, where);
  });

  const robot = spec.robot ?? null;
  if (robot) {
    unknownKeys(robot, KEYS.robot, 'robot', problems);
    if (!isPoint(robot.at)) problems.push('robot: at must be [x, y] tiles');
    else {
      check({ id: 'robot', level: robot.level ?? 1, itemId: 'office_robot', x: robot.at[0], y: robot.at[1], rot: 0 }, 'robot');
      state.robot = newRobot();
      if (robot.cause != null) {
        if (!CAUSES.includes(robot.cause)) problems.push(`robot: cause "${robot.cause}" is not one of ${CAUSES.join(', ')}`);
        else Object.assign(state.robot, { status: 'broken', cause: robot.cause, since: state.week });
      }
    }
  }

  const script = [], byId = new Map(), spots = new Map(), seatedAt = new Map();
  people.forEach((p, i) => {
    const where = `people[${i}]`;
    unknownKeys(p, KEYS.person, where, problems);
    if (typeof p.id !== 'string' || !p.id) return problems.push(`${where}: id is required`);
    if (byId.has(p.id) || state.staff.some((x) => x.id === p.id)) return problems.push(`${where}: duplicate id "${p.id}"`);
    const build = p.build ?? 1;
    if (![0, 1, 2].includes(build)) problems.push(`${where}: build must be 0, 1 or 2`);
    const seated = p.seat != null, standing = p.at != null;
    if (seated === standing) problems.push(`${where}: give exactly one of seat (a desk id) or at (a tile position)`);
    const rec = { id: p.id, name: p.id, role: 'engineer', seniority: 'mid', level: 1, xp: 0, skills: { features: 50, polish: 50, reliability: 50, novelty: 50 }, speed: 1, meaning: 60, stamina: 60, knowledge: 30, traits: [], assignment: { type: 'idle', targetId: null }, mood: 'ok', burnoutWeeks: 0, sabbaticalWeeksLeft: 0, salary: 1000, hiredWeek: 0, founder: false, path: null, pathPending: false, legend: false, record: {}, appearance: { skin: 2, hair: 3, hairColor: '#a3442f', shirt: '#2f3a4a', pants: '#8a7f6a', accessory: 'none', ...(p.look ?? {}), build } };
    state.staff.push(rec);
    byId.set(p.id, { rec, entry: p });
    if (seated) {
      const desk = state.office.placed.find((d) => d.id === p.seat);
      if (!desk) problems.push(`${where}: seat "${p.seat}" is not an item id`);
      else if (desk.itemId !== 'desk') problems.push(`${where}: seat "${p.seat}" is a ${desk.itemId}, not a desk`);
      else if (seatedAt.has(desk.id)) problems.push(`${where}: seat "${desk.id}" is already taken by "${seatedAt.get(desk.id)}"`);
      else { rec.deskId = desk.id; seatedAt.set(desk.id, p.id); spots.set(p.id, seatTile(desk)); }
      if (p.face != null) problems.push(`${where}: a seated person faces their desk; drop face`);
    } else if (standing) {
      if (!isPoint(p.at)) problems.push(`${where}: at must be [x, y] tiles`);
      else {
        const near = [...byId].find(([other, o]) => other !== p.id && o.entry.at && isPoint(o.entry.at) && Math.hypot(o.entry.at[0] - p.at[0], o.entry.at[1] - p.at[1]) < APART);
        if (near) problems.push(`${where}: at ${p.at} is within ${APART} tile of "${near[0]}" at ${near[1].entry.at}`);
        spots.set(p.id, p.at);
        const { w, h } = officeShape(state.officeStage, state.office.expansion ?? 0).grid;
        if (p.at[0] < 0 || p.at[1] < 0 || p.at[0] > w || p.at[1] > h) problems.push(`${where}: at ${p.at} is outside the ${w}x${h} office`);
        const inside = state.office.placed.find((it) => footprintCells(it.itemId, it.x, it.y, it.rot).some(([cx, cy]) => Math.floor(p.at[0]) === cx && Math.floor(p.at[1]) === cy));
        if (inside && !p.free) problems.push(`${where}: at ${p.at} is inside the ${inside.itemId} "${inside.id}" ("free": true stands there anyway)`);
      }
    }
    if (p.gesture != null && !ANIMS.includes(p.gesture)) problems.push(`${where}: gesture "${p.gesture}" is not an animation the game plays (see ANIMS in src/render/character.js)`);
    if (p.t != null && !(Number.isFinite(p.t) && p.t >= 0)) problems.push(`${where}: t must be seconds from the start`);
  });

  // Directions resolve after every position is known (a face can name another person or the robot).
  for (const [id, { entry: p }] of byId) {
    const where = `people "${id}"`, at = spots.get(id);
    const frame = Math.round((p.t ?? 0) * FPS);
    if (p.at != null && at) {
      let dir = null, towardRobot = false;
      const f = p.face ?? 'south';
      if (typeof f === 'string' && COMPASS[f]) dir = COMPASS[f];
      else if (typeof f === 'number') dir = [Math.sin((f * Math.PI) / 180), Math.cos((f * Math.PI) / 180)];
      else if (f === 'robot' && robot && isPoint(robot.at)) towardRobot = true;
      else if (spots.has(f) && f !== id) dir = [spots.get(f)[0] - at[0], spots.get(f)[1] - at[1]];
      else problems.push(`${where}: face "${f}" is not north, east, south, west, a degree, "robot" or a person id`);
      // The runtime aims a face at the robot from where the robot rests, which its plan decides.
      if (towardRobot) script.push({ frame: 0, who: id, op: 'place', at: [...at], toward: 'robot' });
      else if (dir) {
        const len = Math.hypot(...dir);
        if (len < 1e-6) problems.push(`${where}: face points at their own position`);
        else script.push({ frame: 0, who: id, op: 'place', at: [...at], dir: dir.map((v) => +(v / len).toFixed(6)) });
      }
    }
    if (p.gesture) script.push({ frame, who: id, op: 'gesture', name: p.gesture });
  }
  // A staged moment is played by the game's own staging; the composed scene only sets it up.
  (spec.moments ?? []).forEach((m, i) => {
    const where = `moments[${i}]`;
    unknownKeys(m, KEYS.moment, where, problems);
    if (!MOMENTS.includes(m.moment)) return problems.push(`${where}: moment "${m.moment}" is not one of ${MOMENTS.join(', ')}`);
    if (!robot) return problems.push(`${where}: slap needs a robot`);
    const fixer = m.fixer ?? 'nearest';
    if (fixer !== 'nearest' && !state.staff.some((x) => x.id === fixer)) problems.push(`${where}: fixer "${fixer}" is not a person`);
    else script.push({ frame: 0, who: fixer === 'nearest' ? null : fixer, op: 'moment', name: m.moment, fixer });
  });
  if (problems.length) throw new ComposeError(problems);
  state.cash = createMockSim({ scenario: baseName, seed: 7 }).state.cash;
  script.sort((a, b) => a.frame - b.frame || (a.op === 'place' ? -1 : 1) - (b.op === 'place' ? -1 : 1));
  return { state, script };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  try {
    const { state, script } = compose(process.argv[2]);
    if (process.argv.includes('--json')) { process.stdout.write(JSON.stringify({ state, script })); process.exit(0); }
    console.log(JSON.stringify({ officeStage: state.officeStage, placed: state.office.placed, staff: state.staff.map((p) => ({ id: p.id, deskId: p.deskId ?? null, build: p.appearance.build })), robot: state.robot ?? null, script }, null, 1));
  } catch (e) { console.error(e.message); process.exitCode = 2; }
}
