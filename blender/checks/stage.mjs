// Staging checks (#350): does each character moment read on screen? Every scenario plays a moment
// in the mock office, samples the staging probe (src/render/probe.js) for its actors on every frame,
// splits the samples by beat, and holds each beat to its readability spec. It runs from the default
// camera and from a turned view, prints a per-beat table (report.mjs), and exits 1 on any failure.
//
//   node blender/checks/stage.mjs [--only=letter,fumes] [--out shots/stage/report.json] [--jobs=N] [--browser] [--rows]
//
// Each scenario and view plays on the studio engine in its own Node process (scripts/studio/stage-host.mjs):
// no Vite, browser or render slot. --browser plays them in harness pages instead, the reference the engine
// is compared against (scripts/studio/parity.mjs --preset stage). --rows also prints one STAGEROW line per
// row, named by check, view, beat and metric with the value as JSON, for that comparison.
//
// A spec is a list of rules for a beat: { metric, want, test(beatSamples) -> value, pass(value) }.
// A rule with known: <issue> fails as KNOWN (not failing the run) until that issue is fixed: closed by
// a merged PR or commit that changed game code. Then the rule fails again. Issue states come from gh,
// once per run; if gh can't be reached, markers count as open and the run says so. knownView: '<view>'
// limits a rule's marker to that view.
// Most rules are shares: the fraction of the beat's frames that meet a condition.
import { spotReasons } from '../../src/render/spots.js';
import { startHarness } from './harness.mjs';
import { createReport } from './report.mjs';
import { graphBase, graphPassedAt, recordGraphPass, requestedFiles } from './cache.mjs';
import { execFileSync, fork } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { touchedSpecs } from './stage-touched.js';

const args = process.argv.slice(2);
const BROWSER = args.includes('--browser');
const known = ['--browser', '--rows', '--touched', '--out'];
const unknown = args.filter((a, i) => a.startsWith('--') && !known.includes(a) && !/^--(only|touched|jobs)=/.test(a) && args[i - 1] !== '--out');
if (unknown.length) { console.error(`stage: unknown option ${unknown.join(' ')} (want --only=a,b --touched[=base] --jobs=N --out <file> --browser --rows)`); process.exit(2); }
let ONLY = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');
// --touched[=<base>]: only the specs this checkout adds or changes against <base> (default origin/main), and
// the specs of any scenario whose setup changed. --only alone cannot skip a spec it does not name, so a new
// spec is not left unrun by listing the old ones.
const touchedArg = args.find((a) => a === '--touched' || a.startsWith('--touched='));
if (touchedArg) {
  const base = touchedArg.split('=')[1] || 'origin/main';
  let baseText;
  try { baseText = execFileSync('git', ['show', `${base}:blender/checks/stage.mjs`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 }); } catch { console.error(`stage: cannot read blender/checks/stage.mjs at "${base}" (git show failed)`); process.exit(2); }
  const touched = touchedSpecs(baseText, readFileSync(fileURLToPath(import.meta.url), 'utf8'));
  if (!touched.size) { console.log(`stage: no spec added or changed against ${base}`); process.exit(0); }
  for (const [k, why] of touched) console.log(`stage: touched ${k} (${why})`);
  ONLY = [...new Set([...(ONLY ?? []), ...touched.keys()])];
}
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

const Y2K_RULES = [
  share('watching', 'watchers face their equipment within 70 degrees', (x) => x.targetAngle <= 70, 0.8),
  visibleRule, noFade,
];

const SPECS = {
  'y2k.countdown': { moment: 'y2k', beat: 'countdown', role: 'watcher', rules: Y2K_RULES },
  'y2k.nothing': { moment: 'y2k', beat: 'nothing', role: 'watcher', rules: Y2K_RULES },
  'y2k.invoice': { moment: 'y2k', beat: 'invoice', role: 'watcher', rules: Y2K_RULES },
  'growth.honoree': { moment: 'growth', beat: 'cheer', role: 'honoree', rules: [
    share('celebrating', 'honoree celebrates throughout the beat', (x) => x.anim === 'celebrate', 0.9),
    share('facingCamera', 'honoree faces within 70 deg of the camera', (x) => x.faceCam <= 70, 0.9),
    visibleRule, noFade,
  ] },
  'growth.coworker': { moment: 'growth', beat: 'cheer', role: 'coworker', rules: [
    share('celebrating', 'nearby coworkers celebrate throughout the beat', (x) => x.anim === 'celebrate', 0.9),
  ] },
  'company_party.cheer': { moment: 'company_party', beat: 'cheer', rules: [
    share('celebrating', 'company celebrates throughout the beat', (x) => x.anim === 'celebrate', 0.9),
  ] },
  'pet.turn': { moment: 'pet', beat: 'turn', role: 'dog', rules: [
    share('upright', 'stand upright before reaching', x => x.anim === 'idle', 1),
    share('petVisible', 'pet >= 60% unblocked', x => x.petVisible >= 0.6, 0.9), noFade,
  ] },
  'petcat.turn': { moment: 'pet', scenario: 'petcat', beat: 'turn', role: 'cat', rules: [
    share('upright', 'stand upright before reaching', x => x.anim === 'idle', 1),
    share('petVisible', 'pet >= 60% unblocked', x => x.petVisible >= 0.6, 0.9), noFade,
  ] },
  'pet.approach': { moment: 'pet', beat: 'approach', role: 'dog', rules: [
    share('upright', 'wait upright while the pet approaches', x => x.anim === 'idle', 1),
    share('petVisible', 'pet >= 60% unblocked', x => x.petVisible >= 0.6, 0.9), noFade,
  ] },
  'petcat.approach': { moment: 'pet', scenario: 'petcat', beat: 'approach', role: 'cat', rules: [
    share('upright', 'wait upright while the pet approaches', x => x.anim === 'idle', 1),
    share('petVisible', 'pet >= 60% unblocked', x => x.petVisible >= 0.6, 0.9), noFade,
  ] },
  'pet.stroke': { moment: 'pet', beat: 'stroke', role: 'dog', rules: [
    share('atPet', 'right hand within 0.12 m of the crown', x => x.petContact <= 0.12, 0.8),
    share('headVisible', 'head >= 80% unblocked', x => x.petHeadVisible >= 0.8, 0.9),
    share('petVisible', 'pet >= 60% unblocked', x => x.petVisible >= 0.6, 0.9), noFade,
  ] },
  'petcat.stroke': { moment: 'pet', scenario: 'petcat', beat: 'stroke', role: 'cat', rules: [
    share('atPet', 'right hand within 0.12 m of the crown', x => x.petContact <= 0.12, 0.8),
    share('headVisible', 'head >= 80% unblocked', x => x.petHeadVisible >= 0.8, 0.9),
    share('petVisible', 'pet >= 60% unblocked', x => x.petVisible >= 0.6, 0.9), noFade,
  ] },
  // The office robot slapped back to life: the fixer faces it, winds up where both of them show, and
  // the right hand lands on its head.
  'robot.windup': { moment: 'robot', beat: 'windup', role: 'fixer', rules: [
    share('facingRobot', 'face within 35 deg of the robot head', (x) => x.targetAngle <= 35, 0.8),
    share('robotVisible', 'robot >= 60% unblocked', (x) => x.robotVisible >= 0.6, 0.9),
    visibleRule, noFade,
  ] },
  'robot.slap': { moment: 'robot', beat: 'slap', role: 'fixer', rules: [
    { metric: 'robotContact', want: 'right hand within 0.06 m of the robot head during the slap', test: (xs) => Math.min(...xs.map((x) => x.robotContact)), pass: (v) => v <= 0.06 },
    share('robotVisible', 'robot >= 60% unblocked', (x) => x.robotVisible >= 0.6, 0.9),
    visibleRule, noFade,
  ] },
  // At a waffle party the robot serves by the cart, turned toward the winner as far as keeps its
  // face in view; at a music night it plays DJ behind the speaker cart, facing the floor. Either
  // way it shows.
  'robot_party.serve': { moment: 'robot', scenario: 'robot_party', beat: 'serve', role: 'robot', rules: [
    share('robotVisible', 'robot >= 60% unblocked', (x) => x.robotVisible >= 0.6, 0.9),
    share('faceShows', 'faces within 105 deg of the camera', (x) => x.robotFaceCam <= 105, 0.9),
    share('towardWinner', 'turned within 90 deg of the winner', (x) => x.robotFaceTarget <= 90, 0.9),
  ] },
  'robot_dj.dj': { moment: 'robot', scenario: 'robot_dj', beat: 'dj', role: 'robot', rules: [
    share('robotVisible', 'robot >= 60% unblocked', (x) => x.robotVisible >= 0.6, 0.9),
    share('faceCam', 'faces within 60 deg of the camera', (x) => x.robotFaceCam <= 60, 0.9),
  ] },
  'letter.read': { moment: 'letter', beat: 'read', rules: [
    share('gazeOnLetter', 'line of sight meets the letter', (x) => x.gaze.hit === 'held', 0.8),
    share('letterNear', 'letter <= 0.25 m from the eyes, within 30 deg of the face', (x) => x.held && x.held.dist <= 0.25 && x.held.ahead <= 30, 0.8),
    share('facingCamera', 'face within 70 deg of the camera', (x) => x.faceCam <= 70, 0.8),
    visibleRule, noFade,
  ] },
  'letter.slump': { moment: 'letter', beat: 'slump', rules: [
    share('facingCamera', 'face within 70 deg of the camera', (x) => x.faceCam <= 70, 0.8),
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
    share('facingCamera', 'face within 70 deg of the camera', (x) => x.faceCam <= 70, 0.8),
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
    share('facingCamera', 'face within 70 deg of the camera', (x) => x.faceCam <= 70, 0.8),
    share('atInterviewee', 'face within 60 deg of the interviewee', (x) => x.targetAngle <= 60, 0.8),
    visibleRule,
  ] },
  'consultants.clipboard': { moment: 'visitor', scenario: 'consultants', beat: 'interview', role: 'clipboard', rules: [
    share('facingCamera', 'face within 70 deg of the camera', (x) => x.faceCam <= 70, 0.8),
    visibleRule,
  ] },
  'consultants.interviewee': { moment: 'visitor', scenario: 'consultants', beat: 'interview', role: 'interviewee', rules: [
    share('facingCamera', 'face within 70 deg of the camera', (x) => x.faceCam <= 70, 0.8),
    share('atConsultant', 'face within 60 deg of the consultant', (x) => x.targetAngle <= 60, 0.8),
    visibleRule,
  ] },
  // Pizza on a desk: the people who come over face the boxes and stay in view while they eat.
  'pizza.eat': { moment: 'pizza', beat: 'eat', rules: [
    share('facesPizza', 'face within 60 deg of the boxes', (x) => x.targetAngle <= 60, 0.8),
    share('facingCamera', 'face within 80 deg of the camera', (x) => x.faceCam <= 80, 0.6),
    visibleRule,
  ] },
  // Screens taken over: seated people recoil from their monitors; the camera sees them do it.
  'screen.recoil': { moment: 'screen', beat: 'recoil', rules: [
    share('visible', 'body >= 50% unblocked (seated behind a desk)', (x) => x.visible >= 0.5, 0.8),
  ] },
  // A pet carrier by the door: whoever comes over peers at its door, face in view.
  'carrier.peer': { moment: 'carrier', beat: 'peer', rules: [
    share('atCarrier', 'face within 45 deg of the carrier', (x) => x.targetAngle <= 45, 0.8),
    share('facingCamera', 'face within 80 deg of the camera', (x) => x.faceCam <= 80, 0.6),
    visibleRule,
  ] },
  // An outage: the named responders work the rack until the all-clear, facing it and in view. With
  // no rack, or one whose front the camera can't see, they crowd round one of them seated at a desk,
  // watching that screen while the lead types.
  'respond.rack': { moment: 'respond', beat: 'fix', role: 'responder', rules: [
    share('facesWork', 'face within 60 deg of the rack (or, with it turned away, the lead\'s screen)', (x) => x.targetAngle <= 60, 0.9),
    visibleRule, noFade,
  ] },
  'respond_desk.responder': { moment: 'respond', scenario: 'respond_desk', beat: 'fix', role: 'responder', rules: [
    share('facesScreen', 'face within 60 deg of the lead\'s screen', (x) => x.targetAngle <= 60, 0.9),
    visibleRule, noFade,
  ] },
  'respond_desk.lead': { moment: 'respond', scenario: 'respond_desk', beat: 'fix', role: 'lead', rules: [
    share('typing', 'the lead types at their own desk', (x) => x.anim === 'typing', 1),
    share('visible', 'body >= 50% unblocked (seated behind a desk)', (x) => x.visible >= 0.5, 0.9),
  ] },
  ...Object.fromEntries(['carry', 'hold', 'swing'].map((beat) => [`hammer.${beat}`, { moment: 'hammer', beat, rules: [
    ...[['heldHeadDepth', 1e-6], ['heldTorsoDepth', 1e-6], ['heldPalmGap', 0.02], ['heldSupportGap', 0.02], ['heldHeadDistance', 0.6], ['heldHeadJoint', 0.08], ['heldScreenDistance', 0.6]].map(([metric, limit]) =>
      share(metric, `${metric} <= ${limit} m`, (x) => Number.isFinite(x[metric]) && x[metric] <= limit, 1)),
    share('headReach', 'head at least 0.35 m along the shaft from the palm', (x) => x.heldHeadDistance >= 0.35, 1),
    share('shaftVisible', 'at least half the shaft visible', (x) => x.heldHandleVisible >= 0.5, beat === 'carry' ? 0.85 : 1),
    share('headVisible', 'at least half the head visible', (x) => x.heldHeadVisible >= 0.5, beat === 'carry' ? 0.85 : 1),
    share('shaftSilhouette', 'shaft projects at least 60% of its length', (x) => x.heldShaftProjection >= 0.6, 0.95),
    share('headSilhouette', 'head crosses shaft by at least 25% of shaft length', (x) => x.heldHeadCross >= 0.25, 0.95),
  ] }]))
};

// How each moment is set up in the mock floor, and how long to watch it.
const OUTAGE = "S.outage = { productId: S.products[0].id, kind: 'db_wipe', severity: 3, weeks: 0, unrecoverable: false, responderIds: ['s1', 's2', 's3'], etaWeeks: 2, cost: { cash: 0, brand: 0, customers: 0 }, cause: '' }; R.sync(S); R.handleEvents([{ type: 'incident', kind: 'db_wipe', productId: S.products[0].id, caught: false, severity: 3 }], S);";
const SCENARIOS = {
  growth: { query: 'mock=floor', patch: {}, steps: [{ at: 0, js: "S.staff.find((p) => p.id === 's6').legend = true; R.sync(S);" }], seconds: 12 },
  company_party: { query: 'mock=floor', patch: {}, steps: [{ at: 0, js: "R.handleEvents([{ type: 'celebrate', staffId: null }], S);" }], seconds: 6 },
  pet: { query: 'mock=floor', patch: {}, seconds: 6,
    setup: "(await import('/src/render/checks.js')).setupPetPasser(R, S, 'dog', 2.104, 1.0)" },
  robot: { query: 'mock=floor', patch: {}, seconds: 14,
    setup: "(await import('/src/render/checks.js')).setupRobotFix(R, S)" },
  // The robot itself is the actor here (robot: true samples it).
  robot_party: { moment: 'robot', robot: true, query: 'mock=floor', patch: {}, seconds: 14,
    setup: "(await import('/src/render/checks.js')).setupRobotParty(R, S, 'waffle_party')" },
  robot_dj: { moment: 'robot', robot: true, query: 'mock=floor', patch: {}, seconds: 14,
    setup: "(await import('/src/render/checks.js')).setupRobotParty(R, S, 'music_night')" },
  petcat: { moment: 'pet', query: 'mock=floor', patch: {}, seconds: 6,
    setup: "(await import('/src/render/checks.js')).setupPetPasser(R, S, 'cat', 2.104, 1.0)" },
  y2k: { query: 'mock=garage', patch: {}, seconds: 20,
    steps: [{ at: 0, js: "S.flags.y2k = { stage: 'rollover', rolloverWeek: S.week, printerId: 'y2k-printer' }; S.office.props = [{ id: 'y2k-printer', prop: 'printer', x: 4, y: 0, since: S.week }];" }] },
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
  hammer: { query: 'mock=floor', patch: { pendingDecision: { eventId: 'open_plan_office', subjectId: 's1', stage: { prop: 'sledgehammer', anchor: 'wall', x: 4, y: 0 } } }, seconds: 20,
    steps: [{ at: 480, js: "R.handleEvents([{type:'decisionResolved',eventId:'open_plan_office',choice:0}], S); S.pendingDecision=null;" }] },
  // An outage with three named responders, at the floor's rack and, with the rack taken out, at a desk.
  respond: { query: 'mock=floor', patch: {}, seconds: 12, steps: [{ at: 0, js: OUTAGE }] },
  respond_desk: { moment: 'respond', query: 'mock=floor', patch: {}, seconds: 12,
    steps: [{ at: 0, js: `S.office.placed = S.office.placed.filter((p) => p.itemId !== 'server_rack'); R.sync(S); ${OUTAGE}` }] },
  // The consultants at the HQ door, where the sim stages their chair. Who walks in to be
  // interviewed (the nearest idle staffer, seeded) decides how long the walk takes, so the interview
  // beat is scored for a fixed window starting once they arrive, not over the whole run.
  consultants: { query: 'mock=hq', patch: {}, arriveSeconds: 20, beatSeconds: 6,
    arrive: { role: 'interviewee', beat: 'interview' },
    steps: [{ at: 0, js: "const d = R.office.current.L.door; S.pendingDecision = { eventId: 'efficiency_consultants', subjectId: null, stage: { prop: 'visitor_chair', anchor: 'door', x: d.x, y: d.y } };" }] },
};
// The celebrations again in each founded era's office (its desks, clothes and street): the same rules,
// each scenario played with that era's art on.
for (const era of ['preinternet', 'dotcom', 'web2', 'agents']) {
  for (const base of ['growth', 'company_party']) SCENARIOS[`${base}_${era}`] = { ...SCENARIOS[base], era };
  for (const key of ['growth.honoree', 'growth.coworker', 'company_party.cheer']) {
    const [base, role] = key.split('.');
    SPECS[`${base}_${era}.${role}`] = { ...SPECS[key], scenario: `${base}_${era}` };
  }
}

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
// A name that matches no spec would run nothing and read as a pass.
for (const o of ONLY ?? []) {
  if (!Object.keys(SPECS).some((k) => k === o || k.startsWith(`${o}.`))) { console.error(`stage: --only "${o}" matches no spec (specs: ${Object.keys(SPECS).join(', ')})`); process.exit(2); }
}
const rep = createReport('stage');
// A full pass is recorded with the files it loaded (cache.mjs); the run is skipped while none changed.
// Which marker issues are closed changes what fails, so it is part of the inputs a cached pass covers.
const hash = ONLY || args.includes('--rows') ? null : graphBase('stage', `closed:${[...closedIssues].sort((x, y) => x - y).join(',')}\n${BROWSER ? 'browser' : 'engine'}`);
const before = graphPassedAt('stage', hash);
if (before) { console.log(`stage: inputs unchanged since ${before}, skipped`); process.exit(0); }
// Each engine process reports the files it loads (scripts/studio/load-log.mjs) with its result.
const TRACK_LOADS = !!hash && !BROWSER;
const loadedByHosts = new Set();
const LOAD_LOG_HOOK = new URL('../../scripts/studio/load-log.mjs', import.meta.url).href;
// Browsers default to 6; engine processes to a quarter of the cores.
const JOBS = Math.max(1, Number(args.find((a) => a.startsWith('--jobs='))?.slice(7)) || (BROWSER ? 6 : cpus().length >> 2));
const H = BROWSER ? await startHarness({ browsers: JOBS }) : null;
const wanted = Object.entries(SPECS).filter(([k]) => !ONLY || ONLY.some((o) => k === o || k.startsWith(`${o}.`)));
const byMoment = new Map();
// Grouped by scenario: a spec runs in its moment's scenario unless it names its own.
for (const [k, s] of wanted) { const key = s.scenario ?? s.moment; byMoment.set(key, [...(byMoment.get(key) ?? []), [k, s]]); }

// Each moment in each view is its own page, run a few at a time on separate browsers.
const tasks = [];
for (const [scenario, specs] of byMoment) for (const view of views) tasks.push({ moment: specs[0][1].moment, scenario, specs, view });
const results = new Map();
const stageArgs = ({ moment, scenario, view }) => {
  const sc = SCENARIOS[scenario];
  return { moment, patch: sc.patch, steps: sc.steps, setup: sc.setup, seconds: sc.seconds, turns: view.turns, arrive: sc.arrive ?? null, arriveSeconds: sc.arriveSeconds ?? sc.seconds, beatSeconds: sc.beatSeconds ?? 0, robotActor: !!sc.robot };
};
// One engine process per scenario and view; a crash or a thrown error is a page error of that task.
const hosts = new Set();
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => { for (const p of hosts) p.kill('SIGTERM'); process.exit(143); });
const onEngine = (task) => new Promise((resolve) => {
  const p = fork(fileURLToPath(new URL('../../scripts/studio/stage-host.mjs', import.meta.url)), [], { serialization: 'advanced', stdio: ['ignore', 'ignore', 'pipe', 'ipc'], ...(TRACK_LOADS ? { execArgv: [...process.execArgv, '--import', LOAD_LOG_HOOK], env: { ...process.env, HITL_LOAD_TRACK: '1' } } : {}) });
  hosts.add(p);
  let got = null, err = '';
  p.stderr.on('data', (d) => { err += d; });
  p.on('message', (m) => { got = m; for (const f of m.loaded ?? []) loadedByHosts.add(f); });
  p.on('exit', (code, signal) => {
    hosts.delete(p);
    if (got?.ok) resolve({ res: got.res, errors: got.errors });
    else resolve({ res: { actors: [], samples: [], spots: {} }, errors: [got?.error ?? `stage host exited ${code ?? signal}: ${err.trim().split('\n').slice(-3).join(' | ')}`] });
  });
  p.send({ query: SCENARIOS[task.scenario].query, era: SCENARIOS[task.scenario].era ?? null, args: stageArgs(task) });
});
let next = 0;
await Promise.all(Array.from({ length: Math.min(JOBS, tasks.length) }, async (_, slot) => {
  while (next < tasks.length) {
    const task = tasks[next++];
    if (!BROWSER) { results.set(task, await onEngine(task)); continue; }
    const sc = SCENARIOS[task.scenario];
    const { page, errors } = await H.openScene(`quality=medium&${sc.query}${sc.era ? `&eras&eraArt=${sc.era}` : ''}`, { width: 960, height: 600, slot });
    const res = await page.evaluate(async (o) => (await import('/blender/checks/stage-page.js')).playStage(o), stageArgs(task));
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
    const sc = SCENARIOS[task.scenario];
    const firstRow = rep.rows.length;
    if (errors.length) rep.row({ check: task.scenario, view: view.name, beat: '-', metric: 'pageErrors', value: errors.length, want: '0', pass: false });
    if (res.arriveTimedOut) {
      rep.row({ check: task.scenario, view: view.name, beat: '-', metric: 'arrived', value: 0, want: `${sc.arrive.role} reaches the beat within ${sc.arriveSeconds}s`, pass: false });
      continue;
    }
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
        const k2 = (!rule.knownView || rule.knownView === view.name) ? rule.known ?? null : null;
        rep.row({ check: k, view: view.name, beat: `${spec.beat} (${(xs.length / FPS).toFixed(1)}s)`, metric: rule.metric, value, want: rule.want, pass: rule.pass(value), known: k2 && !closedIssues.has(k2) ? k2 : null, closed: k2 && closedIssues.has(k2) ? k2 : null });
      }
    }
    if (rep.rows.slice(firstRow).some((row) => !row.pass)) {
      for (const line of spotReasons(res.spots)) console.log(`spots (${moment}/${view.name}): ${line}`);
    }
  }
}
// What the run loaded: the engine processes' lists, or every file the pages requested.
let loaded = [];
if (hash) {
  loaded = BROWSER ? requestedFiles(H.requested()) : [...loadedByHosts];
}
await H?.close();
const code = rep.finish({ out: OUT });
// The rows for parity.mjs: the beat's length goes with the value, so a beat that runs longer differs.
if (args.includes('--rows')) {
  for (const r of rep.rows) {
    const [, beat, secs] = /^(.*?)(?: \(([\d.]+)s\))?$/.exec(String(r.beat));
    console.log(`STAGEROW ${r.pass ? 'ok' : 'FAIL'} ${r.check} ${r.view} ${beat} ${r.metric} ${JSON.stringify({ value: typeof r.value === 'number' && !Number.isFinite(r.value) ? String(r.value) : r.value, seconds: secs ? Number(secs) : null })}`);
  }
}
if (!code) recordGraphPass('stage', hash, loaded);
// Exit once stdout drains: a reader slower than the rows (parity.mjs under load) would lose the tail.
process.stdout.write('', () => process.exit(code));
