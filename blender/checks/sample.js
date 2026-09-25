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
    // The same collector, recording under another state name (a moment played in this scene).
    at(other) { const self = this; return { ...self, add: (R, ...a) => { const s0 = state; state = other; try { self.add(R, ...a); } finally { state = s0; } }, tol }; },
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

// People against the world and each other: nobody's head or torso (or legs, walking) inside
// furniture, props, walls or another person, except what they are using.
function checkPeople(R, C, t, list = X.bodies(R)) {
  const ps = X.people(R, list);
  const skip = (A, B) => {
    const [p, w] = A.kind === 'person' ? [A, B] : [B, A];
    return w.kind !== 'person' && p.own.has(w.key);
  };
  const what = (p) => (p.walking ? 'walking' : p.moment ? `moment ${p.moment}` : p.anim ?? 'still');
  for (const o of X.crossOverlaps(ps, list, { tol: C.tol.person, skip })) {
    const [p, w] = o.a.kind === 'person' ? [o.a, o.b] : [o.b, o.a];
    for (const q of o.parts) {
      const [pp, wp] = o.a === p ? [q.a, q.b] : [q.b, q.a];
      C.add(R, 'person', t, `person(${what(p)})/${pp}`, `${w.label}/${wp}`, q.depth, o.at, `${p.id} (${what(p)}) ${pp} in ${w.label}${w.id ? `#${w.id}` : ''}[${wp}]`);
    }
  }
  for (const o of X.overlaps(ps, { tol: C.tol.person })) {
    C.add(R, 'person', t, 'person', 'person', o.depth, o.at, `${o.a.id} (${what(o.a)}) in ${o.b.id} (${what(o.b)})`);
  }
  // What they hold or carry against their own head and torso (a printer through the carrier's head).
  const byId = new Map(ps.map((p) => [p.id, p]));
  for (const h of X.carried(R)) {
    const p = byId.get(h.staffId);
    const doing = p ? what(p) : 'still';
    for (const o of X.crossOverlaps([h.thing], [h.body], { tol: C.tol.self })) {
      for (const q of o.parts) {
        const [tp, bp] = o.a === h.thing ? [q.a, q.b] : [q.b, q.a];
        C.add(R, 'self', t, `held/${h.thing.label}`, `own ${bp}`, q.depth, o.at, `${h.staffId} (${doing}) holds ${h.thing.label}[${tp}] ${q.depth.toFixed(3)} m into their own ${bp}`);
      }
    }
  }
}

// Frames as the game runs them, without drawing (the harness's __advance, which refreshes world
// matrices as render() would).
function stepWorld(R, S, n) { window.__advance(n); }

// A window of office life: `seconds` long, things checked every `every` seconds and people every
// PEOPLE_EVERY (a walk past a desk takes well under a second).
const PEOPLE_EVERY = 0.2;
function window_(R, S, C, { seconds, every, t0 = 0 }) {
  const memo = {};
  // One drawn frame settles the camera on the office as it is now, so crops frame the spot.
  R.render(0);
  const k = Math.max(1, Math.round(every / PEOPLE_EVERY));
  const n = Math.round(seconds / every) * k;
  for (let i = 0; i <= n; i++) {
    if (i) stepWorld(R, S, Math.round(PEOPLE_EVERY / DT));
    const t = t0 + i * PEOPLE_EVERY;
    if (i % k === 0) checkFrame(R, C, t, memo);
    checkPeople(R, C, t);
  }
}

// Metres. hand: the wrist sits inside the hand, so a held thing's surface is a hand's width away.
const TOL = { overlap: 0.01, float: 0.015, hand: 0.08, bounds: 0.02, person: 0.02, self: 0.01 };

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

// Every moment, played on purpose so none depends on a seeded game firing it: each decision event
// with a caption (src/data/moments.js) or a staged prop opens on a person with a desk, with its prop
// staged as the sim would, plays for `open` seconds, resolves with each of the first `choices`
// choices (so a moment that answers the choice plays too) for `after` seconds, and is cleared. Then
// each ambient prop moment (keyed by its prop) stands in the office for `open` seconds.
async function momentsPass(R, S, C, { open = 10, after = 5, choices = 1, every = 1 } = {}) {
  const { EVENTS } = await import('/src/data/events.js');
  const { MOMENT_CAPTIONS } = await import('/src/data/moments.js');
  const { stageTile } = await import('/src/sim/props.js');
  const ids = Object.keys(EVENTS).filter((id) => EVENTS[id].stage || (MOMENT_CAPTIONS[id] && EVENTS[id].choices));
  const seated = S.staff.filter((p) => p.mood !== 'away' && R.perks.peek(p.id)?.seat);
  const played = [];
  let k = 0;
  for (const eventId of ids) {
    const ev = EVENTS[eventId];
    const subject = seated[k++ % seated.length];
    let tile = {};
    if (ev.stage) { try { tile = stageTile(S, ev.stage.anchor, subject.id); } catch { tile = {}; } }
    if (ev.stage && ev.stage.anchor === 'subjectDesk' && tile.x == null) {
      const desk = S.office.placed.find((p) => p.id === R.perks.peek(subject.id).seat);
      tile = { x: desk.x, y: desk.y };
    }
    for (let c = 0; c < Math.min(choices, ev.choices?.length ?? 1); c++) {
      S.pendingDecision = { eventId, subjectId: subject.id, stage: ev.stage ? { ...ev.stage, x: tile.x ?? 4, y: tile.y ?? 0 } : null };
      R.handleEvents([{ type: 'decision' }], S);
      const C2 = C.at(`moment:${eventId}${choices > 1 ? `:choice${c}` : ''}`);
      window_(R, S, C2, { seconds: open, every });
      S.pendingDecision = null;
      R.handleEvents([{ type: 'decisionResolved', eventId, choice: c, subjectId: subject.id }], S);
      window_(R, S, C2, { seconds: after, every, t0: open });
      stepWorld(R, S, 60);
      played.push(eventId);
    }
  }
  S.office.props ??= [];
  for (const prop of Object.keys(MOMENT_CAPTIONS).filter((k2) => !EVENTS[k2] && R.props.ids.includes(k2))) {
    const subject = seated[k++ % seated.length];
    const desk = S.office.placed.find((p) => p.id === R.perks.peek(subject.id).seat) ?? S.office.placed[0];
    const id = `sweep_moment_${prop}`;
    S.office.props.push({ id, prop, x: desk.x, y: desk.y, since: S.week, until: { weeks: 2 } });
    window_(R, S, C.at(`moment:${prop}`), { seconds: open, every });
    S.office.props = S.office.props.filter((p) => p.id !== id);
    stepWorld(R, S, 60);
    played.push(prop);
  }
  return played;
}

export async function sampleMock({ name, seconds = 20, every = 1, known = [], crops = 60, propDesks = 0, moments = null }) {
  const R = window.__hitlRender, S = window.__HITL.state;
  R.moments.full = true;
  const C = createCollector({ state: `mock:${name}`, known, crops, tol: TOL });
  stepWorld(R, S, 90);
  R.render(0);
  if (propDesks) { R.perks.hold = true; propsPass(R, S, C, propDesks); R.perks.hold = false; }
  window_(R, S, C, { seconds, every });
  const windows = [{ state: `mock:${name}`, why: 'mock', bodies: X.bodies(R).length, staff: S.staff.length }];
  if (moments) {
    R.perks.hold = true;
    const played = await momentsPass(R, S, C, { ...moments, every });
    R.perks.hold = false;
    windows.push({ state: `mock:${name}`, why: 'moments', played });
  }
  return { violations: C.list, windows };
}

export async function sampleSeed({ seed, bot = 'balanced', weeks = 1040, every = 52, seconds = 6, stagedSeconds = 20, step = 1, known = [], crops = 60, maxStaged = 6 }) {
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
