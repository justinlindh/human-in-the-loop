// In-page state sampler for the scene integrity sweep (sweep.mjs). It steps the live renderer
// through real states and runs the checks in intersect.js on each, collecting violations.
//
//   sampleMock(opts)   the loaded mock scene, over `seconds` of office life; with propDesks, first
//                      every staged prop on that many desks
//   sampleSeed(opts)   the loaded seeded game, played by a bot: a window of office life every
//                      `every` weeks, on each office stage and era change, and whenever a decision
//                      with a staged prop is open (so its moment plays)
//
// A violation: { check, key, state, t, a, b, value, at, crop? }. key names the check and the two
// things by kind (item ids, prop ids), not by instance, so a baseline entry holds across states.
import * as X from './intersect.js';

const DT = 1 / 30;

// Pairs never compared: the shell against itself, and a wall item or wall print against the wall
// it hangs on (it is meant to touch; its support check covers the gap).
function skipPair(A, B) {
  const k = [A.kind, B.kind];
  if (k.every((x) => x === 'wall' || x === 'column')) return true;
  const wallish = (x) => x.kind === 'wallProp' || x.wallMounted;
  if ((wallish(A) && B.kind === 'wall') || (wallish(B) && A.kind === 'wall')) return true;
  return false;
}

function createCollector({ state, known, crops, tol }) {
  const found = new Map();
  let cropped = 0;
  return {
    add(R, check, t, a, b, value, at, detail = null) {
      const [x, y] = [a, b].sort();
      const key = `${check}|${x}|${y}`;
      const prev = found.get(key);
      if (prev && prev.value >= value) { prev.seen++; return; }
      const v = { check, key, state, t: +t.toFixed(2), a: x, b: y, value: +value.toFixed(3), at: at ? [+at.x.toFixed(2), +at.y.toFixed(2), +at.z.toFixed(2)] : null, seen: (prev?.seen ?? 0) + 1, crop: prev?.crop ?? null, ...(detail ? { detail } : {}) };
      if (!v.crop && at && cropped < crops && !known.includes(key)) { v.crop = X.crop(R, at); cropped++; }
      found.set(key, v);
    },
    get list() { return [...found.values()]; },
    tol,
  };
}

// One pass of every check on the current frame. Object checks rerun only when the set of bodies or
// where they stand changes; the hand check runs every time (people move).
function checkFrame(R, C, t, memo) {
  const list = X.bodies(R);
  const sig = list.map((b) => `${b.key}@${b.box.min.x.toFixed(3)},${b.box.min.y.toFixed(3)},${b.box.min.z.toFixed(3)}`).join('|');
  if (sig !== memo.sig) {
    memo.sig = sig;
    // One entry per pair of parts (materials), so a new clash on a baselined pair of things (pizza
    // into the monitor where a plant was accepted) still shows as new.
    for (const o of X.overlaps(list, { tol: C.tol.overlap, skip: skipPair })) {
      for (const p of o.parts) C.add(R, 'overlap', t, `${o.a.label}/${p.a}`, `${o.b.label}/${p.b}`, p.depth, o.at, `${o.a.label}${o.a.id ? `#${o.a.id}` : ''}[${p.a}] ~ ${o.b.label}${o.b.id ? `#${o.b.id}` : ''}[${p.b}]`);
    }
    for (const s of X.support(list, (b) => b.kind === 'deskProp' || b.kind === 'floorProp' || (b.kind === 'placed' && !b.wallMounted))) {
      if (s.gap > C.tol.float) C.add(R, 'float', t, s.b.label, s.under, s.gap, s.at, `${s.b.label} ${s.gap.toFixed(3)} m above ${s.under}`);
    }
    for (const o of X.bounds(R, list, { tol: C.tol.bounds })) C.add(R, 'bounds', t, o.b.label, 'room', o.over, o.at);
  }
  for (const h of X.held(R)) if (h.gap > C.tol.hand) C.add(R, 'hand', t, h.label, 'wrist', h.gap, h.at);
}

function stepWorld(R, S, n) { for (let i = 0; i < n; i++) { window.__tick(1000 / 30); R.sync(S); R.advance(DT); } }

// A window of office life: `seconds` long, checked every `every` seconds.
function window_(R, S, C, { seconds, every, t0 = 0 }) {
  const memo = {};
  const n = Math.round(seconds / every);
  for (let i = 0; i <= n; i++) {
    if (i) stepWorld(R, S, Math.round(every / DT));
    checkFrame(R, C, t0 + i * every, memo);
  }
}

// Metres. hand: the wrist sits inside the hand, so a held thing's surface is a hand's width away.
const TOL = { overlap: 0.01, float: 0.015, hand: 0.08, bounds: 0.02 };

// Every staged prop the renderer can draw, put on `desks` different desks one at a time (desk
// models vary by seat and era: monitor or laptop, plant, papers), and checked once it has popped in.
function propsPass(R, S, C, desks) {
  const all = [...R.office.placed.values()].filter((e) => e.desk);
  const pick = Array.from({ length: Math.min(desks, all.length) }, (_, i) => all[Math.floor((i * all.length) / Math.min(desks, all.length))]);
  const ids = R.props.ids.filter((id) => !/^screens_/.test(id));
  S.office.props ??= [];
  for (const d of pick) for (const prop of ids) {
    const id = `sweep_${prop}`;
    S.office.props.push({ id, prop, x: d.x, y: d.y, since: S.week, until: { weeks: 4 } });
    stepWorld(R, S, 12);
    checkFrame(R, C, 0, {});
    S.office.props = S.office.props.filter((p) => p.id !== id);
    stepWorld(R, S, 8);
  }
}

export async function sampleMock({ name, seconds = 20, every = 1, known = [], crops = 20, propDesks = 0 }) {
  const R = window.__hitlRender, S = window.__HITL.state;
  R.moments.full = true;
  const C = createCollector({ state: `mock:${name}`, known, crops, tol: TOL });
  stepWorld(R, S, 90);
  if (propDesks) { R.perks.hold = true; propsPass(R, S, C, propDesks); R.perks.hold = false; }
  window_(R, S, C, { seconds, every });
  return { violations: C.list, windows: [{ state: `mock:${name}`, why: 'mock', bodies: X.bodies(R).length, staff: S.staff.length }] };
}

export async function sampleSeed({ seed, bot = 'balanced', weeks = 1040, every = 52, seconds = 6, stagedSeconds = 20, step = 1, known = [], crops = 20, maxStaged = 6 }) {
  const R = window.__hitlRender, H = window.__HITL;
  const { botDecide, botTurn } = await import('/src/sim/bots.js');
  R.moments.full = true;
  const out = [], windows = [];
  let stage = -1, era = null, staged = 0;
  const route = (events) => { if (events?.length) H.emit(events); };
  for (let w = 0; w <= weeks && !H.state.gameOver; w++) {
    const S = H.state;
    const stageProp = S.pendingDecision?.stage?.prop;
    const why = S.officeStage !== stage ? `stage ${S.officeStage}` : S.era?.id !== era ? `era ${S.era?.id}` : stageProp && staged < maxStaged ? `decision ${S.pendingDecision.eventId}` : w % every === 0 ? 'every' : null;
    if (why) {
      stage = S.officeStage; era = S.era?.id;
      if (why.startsWith('decision')) staged++;
      const C = createCollector({ state: `seed:${seed}:w${S.week}`, known, crops: crops - out.filter((v) => v.crop).length, tol: TOL });
      // Settle what the weeks since the last window changed (a stage move, new furniture popping in).
      stepWorld(R, S, 120);
      window_(R, S, C, { seconds: why.startsWith('decision') ? stagedSeconds : seconds, every: step });
      for (const v of C.list) v.why = why;
      out.push(...C.list);
      windows.push({ state: `seed:${seed}:w${S.week}`, why, stage: S.officeStage, era: S.era?.id, bodies: X.bodies(R).length, staff: S.staff.length, props: (S.office?.props ?? []).length });
    }
    botDecide(bot, S, { onEvents: route });
    if (S.gameOver) break;
    botTurn(bot, S, { onEvents: route });
    H.tickN(1);
    R.sync(S);
  }
  return { violations: out, windows, end: { week: H.state.week, over: H.state.gameOver?.reason ?? null } };
}
