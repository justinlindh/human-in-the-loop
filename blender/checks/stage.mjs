// Staging checks (#350): does each character moment read on screen? Every scenario plays a moment
// in the mock office, samples the staging probe (src/render/probe.js) for its actors on every frame,
// splits the samples by beat, and holds each beat to its readability spec. It runs from the default
// camera and from a turned view, prints a per-beat table (report.mjs), and exits 1 on any failure.
//
//   node blender/checks/stage.mjs [--only=letter,fumes] [--out shots/stage/report.json]
//
// A spec is a list of rules for a beat: { metric, want, test(beatSamples) -> value, pass(value) }.
// A rule with known: <issue> fails as KNOWN (not failing the run) until that issue is fixed: closed by
// a merged PR or commit that changed game code. Then the rule fails again. Issue states come from gh,
// once per run; if gh can't be reached, markers count as open and the run says so.
// Most rules are shares: the fraction of the beat's frames that meet a condition.
import { spotReasons } from '../../src/render/spots.js';
import { startHarness } from './harness.mjs';
import { createReport } from './report.mjs';
import { inputHash, passedAt, recordPass } from './cache.mjs';
import { execFileSync } from 'node:child_process';

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
  // The visitor at the desk trying the product: at the screen, and in view. A laptop screen sits a
  // hand's width in front of the eyes and well below them, so looking at it reads about 30 to 40 deg
  // off the face's line; looking away from it is 60 and more.
  'visitor.test': { moment: 'visitor', beat: 'test', role: 'visitor', rules: [
    share('atScreen', 'face within 45 deg of the screen', (x) => x.targetAngle <= 45, 0.8),
    visibleRule,
  ] },
  'visitor.explain': { moment: 'visitor', beat: 'explain', role: 'founder', rules: [
    share('atScreen', 'face within 45 deg of the screen in front of the visitor', (x) => x.targetAngle <= 45, 0.8),
    visibleRule, noFade,
  ] },
  // The efficiency consultants: the seated one and the nervous colleague face each other across the
  // view, both turned three-quarters to the camera; the one with the clipboard stands behind, in view.
  // (Their own scenario: the moment is the visitor one.)
  'consultants.consultant': { moment: 'visitor', scenario: 'consultants', beat: 'interview', role: 'consultant', rules: [
    share('faceVisible', 'face within 70 deg of the camera', (x) => x.faceCam <= 70, 0.8),
    share('atInterviewee', 'face within 60 deg of the interviewee', (x) => x.targetAngle <= 60, 0.8),
    visibleRule,
  ] },
  'consultants.clipboard': { moment: 'visitor', scenario: 'consultants', beat: 'interview', role: 'clipboard', rules: [
    share('faceVisible', 'face within 70 deg of the camera', (x) => x.faceCam <= 70, 0.8),
    visibleRule,
  ] },
  'consultants.interviewee': { moment: 'visitor', scenario: 'consultants', beat: 'interview', role: 'interviewee', rules: [
    share('faceVisible', 'face within 70 deg of the camera', (x) => x.faceCam <= 70, 0.8),
    share('atConsultant', 'face within 60 deg of the consultant', (x) => x.targetAngle <= 60, 0.75),
    visibleRule,
  ] },
  // Pizza on a desk: the people who come over face the boxes and stay in view while they eat.
  'pizza.eat': { moment: 'pizza', beat: 'eat', rules: [
    share('facesPizza', 'face within 60 deg of the boxes', (x) => x.targetAngle <= 60, 0.8),
    share('faceVisible', 'face within 80 deg of the camera', (x) => x.faceCam <= 80, 0.6),
    visibleRule,
  ] },
  // Screens taken over: seated people recoil from their monitors; the camera sees them do it.
  'screen.recoil': { moment: 'screen', beat: 'recoil', rules: [
    share('visible', 'body >= 50% unblocked (seated behind a desk)', (x) => x.visible >= 0.5, 0.8),
  ] },
  // A pet carrier by the door: whoever comes over peers at its door, face in view.
  'carrier.peer': { moment: 'carrier', beat: 'peer', rules: [
    share('atCarrier', 'face within 45 deg of the carrier', (x) => x.targetAngle <= 45, 0.8),
    share('faceVisible', 'face within 80 deg of the camera', (x) => x.faceCam <= 80, 0.6),
    visibleRule,
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
  pizza: { query: 'mock=floor', patch: { pendingDecision: { eventId: 'hackathon', subjectId: 's1', stage: { prop: 'pizza_boxes', anchor: 'subjectDesk' } } }, seconds: 16 },
  screen: { query: 'mock=floor', patch: { pendingDecision: { eventId: 'bridge_loan', subjectId: null, stage: { prop: 'screens_red', anchor: 'screens' } } }, seconds: 12 },
  carrier: { query: 'mock=floor', patch: { pendingDecision: { eventId: 'cat_request', subjectId: 's3', stage: { prop: 'pet_carrier', anchor: 'door' } } }, seconds: 16 },
  // The fetch and carry follow the aisles; observe the hold after both walks reach the wall.
  hammer: { query: 'mock=floor', patch: { pendingDecision: { eventId: 'open_plan_office', subjectId: 's1', stage: { prop: 'sledgehammer', anchor: 'wall', x: 4, y: 0 } } }, seconds: 30 },
  // The consultants at the HQ door, where the sim stages their chair.
  consultants: { query: 'mock=hq', patch: {}, seconds: 16,
    steps: [{ at: 0, js: "const d = R.office.current.L.door; S.pendingDecision = { eventId: 'efficiency_consultants', subjectId: null, stage: { prop: 'visitor_chair', anchor: 'door', x: d.x, y: d.y } };" }] },
};

const views = [{ name: 'default', turns: 0 }, { name: 'turned', turns: 1 }];
// The issues known rules point at, and which of them are fixed: closed by a merged PR (or a commit)
// that changed game code (src/ or public/: a staging fix may be in render, sim or data). A fixed issue
// no longer excuses its rules. An issue closed any other way (by hand, or by a PR that only mentions
// it) still excuses them, with a note to reopen it, so closing an issue early never turns every PR red.
const gh = (...a) => execFileSync('gh', a, { timeout: 15000, encoding: 'utf8' }).trim();
const GAME = /^(src|public)\//;
const closedIssues = new Set();
for (const n of new Set(Object.values(SPECS).flatMap((sp) => sp.rules.map((r) => r.known)).filter(Boolean))) {
  try {
    // gh fills {owner} and {repo} from this checkout's repository.
    const q = 'query($owner:String!,$repo:String!,$n:Int!){repository(owner:$owner,name:$repo){issue(number:$n){state timelineItems(itemTypes:[CLOSED_EVENT],last:1){nodes{... on ClosedEvent{closer{__typename ... on PullRequest{number merged} ... on Commit{oid}}}}}}}}';
    const issue = JSON.parse(gh('api', 'graphql', '-f', `query=${q}`, '-F', 'owner={owner}', '-F', 'repo={repo}', '-F', `n=${n}`)).data.repository.issue;
    if (issue.state !== 'CLOSED') continue;
    const closer = issue.timelineItems.nodes[0]?.closer ?? null;
    let files = [], by = 'hand';
    if (closer?.__typename === 'PullRequest' && closer.merged) {
      by = `#${closer.number}`;
      // Paged, so a fix with hundreds of files is read whole.
      files = gh('api', '--paginate', `repos/{owner}/{repo}/pulls/${closer.number}/files`, '--jq', '.[].filename').split('\n');
    } else if (closer?.__typename === 'Commit') {
      by = closer.oid.slice(0, 7);
      files = gh('api', '--paginate', `repos/{owner}/{repo}/commits/${closer.oid}`, '--jq', '.files[].filename').split('\n');
    } else if (closer?.__typename === 'PullRequest') by = `#${closer.number} (not merged)`;
    if (files.some((f) => GAME.test(f))) closedIssues.add(n);
    else console.log(`stage: issue #${n} was closed by ${by}, which changed no game code; its known rules still excuse. Reopen #${n} until its fix merges.`);
  } catch {
    console.log(`stage: could not read issue #${n} (gh unavailable?); its known rules count as open`);
  }
}
const rep = createReport('stage');
// A full pass is recorded against a hash of every input (cache.mjs); unchanged inputs skip the run.
// Which marker issues are closed changes what fails, so it is part of the inputs a cached pass covers.
const hash = ONLY ? null : inputHash('stage', `closed:${[...closedIssues].sort((x, y) => x - y).join(',')}`);
const before = passedAt('stage', hash);
if (before) { console.log(`stage: inputs unchanged since ${before}, skipped`); process.exit(0); }
const JOBS = Math.max(1, Number(args.find((a) => a.startsWith('--jobs='))?.slice(7)) || 6);
const H = await startHarness({ browsers: JOBS });
const wanted = Object.entries(SPECS).filter(([k]) => !ONLY || ONLY.some((o) => k === o || k.startsWith(`${o}.`)));
const byMoment = new Map();
// Grouped by scenario: a spec runs in its moment's scenario unless it names its own.
for (const [k, s] of wanted) { const key = s.scenario ?? s.moment; byMoment.set(key, [...(byMoment.get(key) ?? []), [k, s]]); }

// Each moment in each view is its own page, run a few at a time on separate browsers.
const tasks = [];
for (const [scenario, specs] of byMoment) for (const view of views) tasks.push({ moment: specs[0][1].moment, scenario, specs, view });
const results = new Map();
let next = 0;
await Promise.all(Array.from({ length: Math.min(JOBS, tasks.length) }, async (_, slot) => {
  while (next < tasks.length) {
    const task = tasks[next++];
    const { moment, view } = task;
    const sc = SCENARIOS[task.scenario];
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
      return { actors: [...actors], samples, spots: R.debug?.spots ?? {} };
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
    const firstRow = rep.rows.length;
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
        const k2 = rule.known ?? null;
        rep.row({ check: k, view: view.name, beat: `${spec.beat} (${(xs.length / FPS).toFixed(1)}s)`, metric: rule.metric, value, want: rule.want, pass: rule.pass(value), known: k2 && !closedIssues.has(k2) ? k2 : null, closed: k2 && closedIssues.has(k2) ? k2 : null });
      }
    }
    if (rep.rows.slice(firstRow).some((row) => !row.pass)) {
      for (const line of spotReasons(res.spots)) console.log(`spots (${moment}/${view.name}): ${line}`);
    }
  }
}
await H.close();
const code = rep.finish({ out: OUT });
if (!code) recordPass('stage', hash);
process.exit(code);
