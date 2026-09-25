// Staging checks (#350): does each character moment read on screen? Every scenario plays a moment
// in the mock office, samples the staging probe (src/render/probe.js) for its actors on every frame,
// splits the samples by beat, and holds each beat to its readability spec. It runs from the default
// camera and from a turned view, prints a per-beat table (report.mjs), and exits 1 on any failure.
//
//   node blender/checks/stage.mjs [--only=letter,fumes] [--out shots/stage/report.json]
//
// A spec is a list of rules for a beat: { metric, want, test(beatSamples) -> value, pass(value) }.
// Most rules are shares: the fraction of the beat's frames that meet a condition.
import { startHarness } from './harness.mjs';
import { createReport } from './report.mjs';
import { inputHash, passedAt, recordPass } from './cache.mjs';

const args = process.argv.slice(2);
const ONLY = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'shots/stage/report.json';
const FPS = 30;

// Rule helpers over one beat's samples (each sample: the probe's measure plus t).
const share = (metric, want, cond, min) => ({ metric, want: `>= ${min} of frames (${want})`, test: (xs) => xs.filter(cond).length / Math.max(1, xs.length), pass: (v) => v >= min });
const mean = (metric, want, f, pass) => ({ metric, want, test: (xs) => xs.reduce((a, x) => a + f(x), 0) / Math.max(1, xs.length), pass });
const visibleRule = share('visible', 'body >= 70% unblocked', (x) => x.visible >= 0.7, 0.9);
const noFade = share('noFade', 'no faded column over them', (x) => x.fadeOver === 0, 1);

// Hand motion over the beat: dominant frequency and half-amplitude along the hand's busiest axis,
// for the busier hand (fanning is fast and small; a wave is slow and wide).
function motion(xs) {
  let best = { hz: 0, amp: 0, var: -1 };
  const dur = xs.length / FPS;
  for (const h of [0, 1]) for (const axis of [0, 1, 2]) {
    const v = xs.map((x) => x.handsRel[h][axis]);
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    const d = v.map((y) => y - m);
    const vari = d.reduce((a, b) => a + b * b, 0) / d.length;
    if (vari <= best.var) continue;
    let cross = 0;
    for (let i = 1; i < d.length; i++) if (Math.sign(d[i]) !== Math.sign(d[i - 1]) && Math.abs(d[i] - d[i - 1]) > 1e-4) cross++;
    const sorted = [...v].sort((a, b) => a - b);
    const amp = (sorted[Math.floor(sorted.length * 0.95)] - sorted[Math.floor(sorted.length * 0.05)]) / 2;
    best = { hz: cross / 2 / Math.max(dur, 1e-3), amp, var: vari };
  }
  return best;
}

const SPECS = {
  'letter.read': { moment: 'letter', beat: 'read', rules: [
    share('gazeOnLetter', 'line of sight meets the letter', (x) => x.gaze.hit === 'held', 0.8),
    share('letterNear', 'letter <= 0.25 m from the eyes, within 30 deg of the face', (x) => x.held && x.held.dist <= 0.25 && x.held.ahead <= 30, 0.8),
    share('faceVisible', 'face within 70 deg of the camera', (x) => x.faceCam <= 70, 0.8),
    visibleRule, noFade,
  ] },
  'letter.slump': { moment: 'letter', beat: 'slump', rules: [
    share('faceVisible', 'face within 70 deg of the camera', (x) => x.faceCam <= 70, 0.8),
    { metric: 'headDrop', want: '>= 0.03 m below the reading head height', test: (xs, all) => {
      const read = all.filter((x) => x.beat === 'read');
      if (!read.length || !xs.length) return 0;
      const h = (a) => a.reduce((s, x) => s + x.headY, 0) / a.length;
      return h(read) - h(xs);
    }, pass: (v) => v >= 0.03 },
    visibleRule, noFade,
  ] },
  'fumes.fan': { moment: 'fumes', beat: 'fan', rules: [
    { metric: 'handHz', want: '>= 3 Hz', test: (xs) => motion(xs).hz, pass: (v) => v >= 3 },
    { metric: 'handAmp', want: '<= 0.15 m', test: (xs) => motion(xs).amp, pass: (v) => v > 0.005 && v <= 0.15 },
    mean('leanAway', 'head behind the feet, away from the fumes (m)', (x) => x.lean ?? 0, (v) => v < -0.01),
    share('headAway', 'face >= 50 deg off the fumes', (x) => x.targetAngle >= 50, 0.8),
    share('smokeBetween', 'smoke on the line from eyes to the fumes', (x) => (x.between ?? 0) > 0, 0.5),
    visibleRule, noFade,
  ] },
  // The printer carried out back: both carriers hold it low in both hands, its middle well under
  // their heads, and stay in view; the one with the bat faces it while swinging, bat in hand.
  // The carry crosses the office, so it passes behind a pillar or a desk now and then: its
  // visibility is held to most of the walk rather than all of it.
  'printer.carry': { moment: 'printer', beat: 'carry', role: 'carrier', rules: [
    share('inHands', 'printer centre within 0.5 m of a hand', (x) => x.held && x.heldHand <= 0.5, 1),
    share('heldLow', 'printer centre >= 0.3 m below the head centre', (x) => x.held && x.heldDrop >= 0.3, 1),
    share('visible', 'body >= 70% unblocked', (x) => x.visible >= 0.7, 0.75),
    share('noFade', 'no faded column over them', (x) => x.fadeOver === 0, 0.6),
  ] },
  // Watching the smash while others walk past: a column behind them may fade for a few frames as
  // someone passes behind it too.
  'printer.watch': { moment: 'printer', beat: 'watch', role: 'carrier', rules: [
    visibleRule, share('noFade', 'no faded column over them', (x) => x.fadeOver === 0, 0.95),
  ] },
  'printer.smash': { moment: 'printer', beat: 'smash', role: 'bat', rules: [
    share('batInHand', 'bat centre within 0.6 m of a hand', (x) => x.held && x.heldHand <= 0.6, 1),
    share('facesPrinter', 'face within 45 deg of the printer', (x) => x.targetAngle <= 45, 0.8),
    visibleRule, noFade,
  ] },
  // The first user test: the founders crouch out of the visitor's sight, faces to the camera, watching
  // the visitor; on "Explain everything" one leans in beside the visitor, at their screen.
  'visitor.hide': { moment: 'visitor', beat: 'hide', role: 'founder', rules: [
    share('faceVisible', 'face within 70 deg of the camera', (x) => x.faceCam <= 70, 0.8),
    share('watching', 'face within 60 deg of the visitor', (x) => x.targetAngle <= 60, 0.8),
    visibleRule, noFade,
  ] },
  // The visitor at the desk trying the product: at the screen, and in view.
  'visitor.test': { moment: 'visitor', beat: 'test', role: 'visitor', rules: [
    share('atScreen', 'face within 35 deg of the screen', (x) => x.targetAngle <= 35, 0.8),
    visibleRule,
  ] },
  'visitor.explain': { moment: 'visitor', beat: 'explain', role: 'founder', rules: [
    share('atScreen', 'face within 45 deg of the screen in front of the visitor', (x) => x.targetAngle <= 45, 0.8),
    visibleRule, noFade,
  ] },
  'hammer.hold': { moment: 'hammer', beat: 'hold', rules: [
    share('inHand', 'hammer centre within 0.6 m of a hand', (x) => x.held && x.heldHand <= 0.6, 1),
    share('notOverHead', 'hammer centre not above the top of the head', (x) => x.heldAbove <= 0.05, 1),
    visibleRule,
  ] },
};

// How each moment is set up in the mock floor, and how long to watch it.
const SCENARIOS = {
  letter: { query: 'mock=floor', patch: { pendingDecision: { eventId: 'resignation_letter', subjectId: 's6', stage: { prop: 'envelope', anchor: 'subjectDesk', x: 12, y: 2 } } }, seconds: 16 },
  fumes: { query: 'mock=floor', patch: { pendingDecision: { eventId: 'agent_runaway_spend', subjectId: null, stage: { prop: 'rack_hot', anchor: 'wall', x: 7, y: 0 } } }, seconds: 16 },
  // Staged by the kitchen, then taken out back 1 s in, the wreck staged where it will lie.
  printer: { query: 'mock=floor', patch: { pendingDecision: { eventId: 'printer_jam', subjectId: 's1', stage: { prop: 'printer_jammed', anchor: 'kitchen', x: 1, y: 1 } } }, seconds: 32,
    steps: [{ at: 30, js: "S.pendingDecision = null; S.office.props = [...(S.office.props ?? []), { id: 'stage_wreck', prop: 'printer_wrecked', x: 1, y: 1, since: S.week, until: { weeks: 4 } }]; R.handleEvents([{ type: 'decisionResolved', eventId: 'printer_jam', choice: 0, subjectId: 's1' }], S);" }] },
  // The first user test in the garage, both founders there; "Explain everything" 8 s in.
  visitor: { query: 'mock=garage', patch: { pendingDecision: { eventId: 'first_user_test', subjectId: 's1', stage: { prop: 'visitor_chair', anchor: 'subjectDesk', x: 2, y: 2 } } }, seconds: 16,
    steps: [{ at: 240, js: "S.pendingDecision = null; R.handleEvents([{ type: 'decisionResolved', eventId: 'first_user_test', choice: 1, subjectId: 's1' }], S);" }] },
  hammer: { query: 'mock=floor', patch: { pendingDecision: { eventId: 'open_plan_office', subjectId: 's1', stage: { prop: 'sledgehammer', anchor: 'wall', x: 4, y: 0 } } }, seconds: 16 },
};

const views = [{ name: 'default', turns: 0 }, { name: 'turned', turns: 1 }];
const rep = createReport('stage');
// A full pass is recorded against a hash of every input (cache.mjs); unchanged inputs skip the run.
const hash = ONLY ? null : inputHash('stage');
const before = passedAt('stage', hash);
if (before) { console.log(`stage: inputs unchanged since ${before}, skipped`); process.exit(0); }
const JOBS = Math.max(1, Number(args.find((a) => a.startsWith('--jobs='))?.slice(7)) || 6);
const H = await startHarness({ browsers: JOBS });
const wanted = Object.entries(SPECS).filter(([k]) => !ONLY || ONLY.some((o) => k === o || k.startsWith(`${o}.`)));
const byMoment = new Map();
for (const [k, s] of wanted) byMoment.set(s.moment, [...(byMoment.get(s.moment) ?? []), [k, s]]);

// Each moment in each view is its own page, run a few at a time on separate browsers.
const tasks = [];
for (const [moment, specs] of byMoment) for (const view of views) tasks.push({ moment, specs, view });
const results = new Map();
let next = 0;
await Promise.all(Array.from({ length: Math.min(JOBS, tasks.length) }, async (_, slot) => {
  while (next < tasks.length) {
    const task = tasks[next++];
    const { moment, view } = task;
    const sc = SCENARIOS[moment];
    const { page, errors } = await H.openScene(`quality=medium&${sc.query}`, { width: 960, height: 600, slot });
    const res = await page.evaluate(async ({ moment, patch, steps, seconds, turns }) => {
      const R = window.__hitlRender, S = window.__HITL.state;
      const THREE = R.THREE;
      if (!R.moments?.kinds?.includes(moment)) return { skip: `the ${moment} moment is not in this build` };
      R.perks.hold = true;
      R.moments.full = true;
      // The specs hold staging to the default and the turned view, so the moment camera stays put.
      window.dispatchEvent(new CustomEvent('hitl:cameraSettings', { detail: { momentCamera: false } }));
      for (let i = 0; i < turns; i++) { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' })); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'e' })); }
      window.__step(90);
      Object.assign(S, JSON.parse(JSON.stringify(patch)));
      const samples = [];
      // Everyone the moment takes part, each sampled every frame until the moment is over for all.
      const actors = new Set();
      for (let f = 0; f < seconds * 30; f++) {
        for (const st of steps ?? []) if (st.at === f) new Function('S', 'R', st.js)(S, R);
        window.__step(1);
        for (const [id, m] of R.moments.active) if (m === moment) actors.add(id);
        // The moment's own actors (visitors) are staged too.
        for (const e of R.moments.extras?.() ?? []) if (e.stage.moment === moment) actors.add(e.id);
        let live = 0;
        for (const actor of actors) {
          const m = R.probe(actor);
          if (!m?.moment) continue;
          live++;
          // Held prop against the hands and the head, for the hold rules.
          const st = R.moments.staging(actor);
          if (m.held) {
            const c = new THREE.Box3().setFromObject(st.held).getCenter(new THREE.Vector3());
            m.heldHand = Math.min(...m.hands.map((h) => Math.hypot(h[0] - c.x, h[1] - c.y, h[2] - c.z)));
            m.heldAbove = c.y - (m.headY + 0.3);
            m.heldDrop = m.headY - c.y;
          }
          samples.push({ t: f / 30, actor, role: st?.role ?? null, ...m });
        }
        if (samples.length && !live) break;
      }
      return { actors: [...actors], samples };
    }, { moment, patch: sc.patch, steps: sc.steps, seconds: sc.seconds, turns: view.turns });
    await page.close();
    results.set(task, { res, errors });
  }
}));

// Rows in a fixed order: by moment, then view.
for (const task of tasks) {
  const { specs, view } = task;
  const moment = task.moment;
  {
    const { res, errors } = results.get(task);
    if (res.skip) { for (const [k] of specs) if (view.turns === 0) rep.skip(k, res.skip); continue; }
    if (errors.length) rep.row({ check: moment, view: view.name, beat: '-', metric: 'pageErrors', value: errors.length, want: '0', pass: false });
    // Every role the moment stages needs a spec: an actor nobody wrote a rule for can stare at a
    // wall and still pass. Walking and waiting are between beats and need none.
    if (view.turns === 0) {
      const roles = new Set(res.samples.filter((x) => x.beat && !['walk', 'wait'].includes(x.beat)).map((x) => x.role ?? null));
      for (const role of roles) {
        const covered = Object.values(SPECS).some((sp) => sp.moment === moment && (!sp.role || sp.role === role));
        if (!covered) rep.row({ check: `${moment}.lint`, view: view.name, beat: '-', metric: 'roleWithoutSpec', value: role ?? '(no role)', want: 'a spec rule for every staged role', pass: false });
      }
    }
    for (const [k, spec] of specs) {
      const xs = res.samples.filter((x) => x.beat === spec.beat && (!spec.role || x.role === spec.role));
      if (!xs.length) { rep.row({ check: k, view: view.name, beat: spec.beat, metric: 'beatSeen', value: 0, want: 'the beat happens', pass: false }); continue; }
      for (const rule of spec.rules) {
        const value = rule.test(xs, res.samples);
        rep.row({ check: k, view: view.name, beat: `${spec.beat} (${(xs.length / FPS).toFixed(1)}s)`, metric: rule.metric, value, want: rule.want, pass: rule.pass(value) });
      }
    }
  }
}
await H.close();
const code = rep.finish({ out: OUT });
if (!code) recordPass('stage', hash);
process.exit(code);
