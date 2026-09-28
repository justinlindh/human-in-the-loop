// Compare complete pose rows and scene state against rendered stepping, with actual WebGL draws
// counted before initialization. Run under timeout/nice; the harness acquires the render lock.
// node blender/checks/pose-nodraw.mjs [--json <report>] [--snapshot <indexed snapshot>]
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { startHarness } from './harness.mjs';
import { openAt, resolveTarget } from '../../scripts/events/load.js';
import { judgeScene } from './pose-rules.js';

const args = process.argv.slice(2);
const opt = (name) => args[args.indexOf(name) + 1];
const H = await startHarness({ auditDraws: true });
const reports = [];
const frames = [0, 1, 6, 15, 30, 60, 90, 120, 180, 240, 300, 450, 600, 900];

async function run(fixture, rendered) {
  const opened = fixture.snapshot
    ? await openAt(H, resolveTarget({ snapshot: fixture.snapshot }), { width: 1280, height: 800 })
    : await H.openScene(`quality=medium&mock=floor&seed=7&rig=${fixture.rig}`, { width: 1280, height: 800 });
  const { page, errors } = opened;
  try {
    const result = await page.evaluate(async ({ fixture, rendered, frames }) => {
      const { measureScene } = await import('/blender/checks/pose-scene.js');
      const R = window.__hitlRender, S = window.__HITL.state;
      const subject = fixture.snapshot ? S.pendingDecision.subjectId : 's3';
      const other = fixture.snapshot ? S.staff.find(p => p.id !== subject).id : 's4';
      const step = rendered ? window.__step : window.__sample;
      const initialization = window.__drawAudit().total;
      for (let i = 0; i < fixture.view; i++) {
        dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }));
        dispatchEvent(new KeyboardEvent('keyup', { key: 'e' }));
      }
      (rendered ? window.__settle : window.__sample)(30);
      window.__reseedGame();
      const warmup = window.__drawAudit().total - initialization;
      if (fixture.kind === 'printer') S.pendingDecision = { eventId: 'printer_jam', subjectId: 's1', stage: { prop: 'printer_jammed', anchor: 'kitchen', x: 1, y: 1 } };
      R.handleEvents([{ type: 'say', staffId: subject, text: 'Pose overlay lifetime' }, { type: 'chat', fromId: other, text: 'Pose emote lifetime' }], S);
      const rows = [], states = [];
      let at = 0;
      for (const frame of frames) {
        while (at < frame) {
          if (at === 30 && fixture.kind === 'printer') {
            S.pendingDecision = null;
            S.office.props = [...(S.office.props ?? []), { id: 'stage_wreck', prop: 'printer_wrecked', x: 1, y: 1, since: S.week, until: { weeks: 4 } }];
            R.handleEvents([{ type: 'decisionResolved', eventId: 'printer_jam', choice: 0, subjectId: 's1' }], S);
          }
          if (at === 6) R.easeTo(0, 0, 1.2, 2);
          step(1);
          at++;
        }
        rows.push(...window.__tool(() => measureScene(R, S)).map(row => ({ frame, ...row })));
        states.push({ frame, camera: R.camera.matrixWorld.toArray(), projection: R.camera.projectionMatrix.toArray(), stats: R.stats });
      }
      // Move a blocker across a real actor's face using a close diagnostic camera. These fresh
      // samples must change even though no frame draw occurs between them.
      const occlusion = window.__tool(() => {
        const T = R.THREE;
        let clear, eye, forward, selected;
        // A loaded scene may put the requested actor behind furniture even from this close angle.
        // Establish a positive control with an actually visible face before testing the blocker.
        for (const id of [subject, ...S.staff.map(p => p.id).filter(id => id !== subject)]) {
          const p = R.probe(id);
          if (!p) continue;
          eye = new T.Vector3().fromArray(p.eyes); forward = new T.Vector3().fromArray(p.forward).normalize();
          R.camera.position.copy(eye).addScaledVector(forward, .7);
          R.camera.lookAt(eye); R.camera.updateMatrixWorld();
          clear = measureScene(R, S, { who: [id] })[0];
          if (clear?.faceVisible > 0) { selected = id; break; }
        }
        if (!selected) throw new Error('blocker fixture requires a visible facial landmark');
        const mask = new T.Mesh(new T.BoxGeometry(20, 20, .1), new T.MeshBasicMaterial());
        mask.userData.propId = 'pose-test-mask';
        mask.position.copy(eye).addScaledVector(forward, .2); mask.quaternion.copy(R.camera.quaternion);
        const read = () => measureScene(R, S, { who: [selected] })[0];
        R.scene.add(mask); const blocked = read();
        mask.position.x += 100; const restored = read();
        mask.removeFromParent(); mask.geometry.dispose(); mask.material.dispose();
        return { clear, blocked, restored };
      });
      return { rows, states, occlusion, subject, draws: { initialization, warmup, sampling: window.__drawAudit().total - initialization - warmup } };
    }, { fixture, rendered, frames });
    assert.deepEqual(errors, [], 'browser errors');
    return result;
  } finally { await page.close(); }
}

try {
  const fixtures = [0, 1].flatMap(rig => [0, 2].map(view => ({ kind: 'printer', rig, view })));
  if (args.includes('--snapshot')) fixtures.push({ kind: 'snapshot', snapshot: opt('--snapshot'), view: 0 });
  for (const fixture of fixtures) {
    const reference = await run(fixture, true), candidate = await run(fixture, false);
    if (args.includes('--json')) writeFileSync(opt('--json'), JSON.stringify({ fixture, reference, candidate }));
    assert.equal(candidate.draws.sampling, 0, 'no sampling WebGL drawing');
    assert.equal(candidate.draws.warmup, 0, 'no warmup WebGL drawing');
    assert(reference.draws.warmup > 0 && reference.draws.sampling > 0, 'unchanged rendered path must fail the zero-draw assertion');
    // Exact equality includes every legacy/projected field, IDs, nulls, overlay lifetime, matrix,
    // effect count and staged beat. No numeric tolerance is needed for identical seeded inputs.
    for (let i = 0; i < reference.rows.length; i++) assert.deepEqual(candidate.rows[i], reference.rows[i], `complete row ${i}, frame ${reference.rows[i].frame}, id ${reference.rows[i].id}`);
    assert.equal(candidate.rows.length, reference.rows.length);
    assert.deepEqual(candidate.states, reference.states, 'camera matrices and effects');
    assert.deepEqual(candidate.occlusion, reference.occlusion, 'moving face blocker');
    assert(candidate.rows.some(r => r.projected.overlays.some(o => o.kind === 'bubble')), 'real DOM bubble');
    assert(candidate.rows.some(r => r.projected.overlays.some(o => o.kind === 'emote')), 'emote');
    assert(!candidate.rows.filter(r => r.frame === 900).some(r => r.projected.overlays.some(o => o.text === 'Pose overlay lifetime')), 'bubble expires');
    assert.notDeepEqual(candidate.states[0].camera, candidate.states[4].camera, 'camera moves without drawing');
    const occlusion = candidate.occlusion;
    assert(occlusion.clear.faceVisible > 0, 'clear face');
    assert.equal(occlusion.blocked.faceVisible, 0);
    assert.equal(occlusion.blocked.occluder, 'prop pose-test-mask');
    assert.equal(occlusion.restored.faceVisible, occlusion.clear.faceVisible);
    if (fixture.kind === 'printer') {
      assert(candidate.rows.some(r => r.heldGap !== null), 'held props measured');
      assert(new Set(candidate.rows.filter(r => r.moment === 'printer').map(r => r.beat)).size >= 2, 'printer stage transitions');
    }
    assert.equal(judgeScene(candidate.rows, frames, ['absent-subject'], []).pass, false);
    assert.equal(judgeScene(candidate.rows.filter(r => r.frame !== 30), frames, [candidate.subject], []).pass, false);
    assert.equal(judgeScene(candidate.rows, frames, [candidate.subject], [{ measure: 'facePx', op: '<', value: 0, share: 1 }]).pass, false);
    reports.push({ fixture, rows: candidate.rows.length, referenceDraws: reference.draws, candidateDraws: candidate.draws, beats: [...new Set(candidate.rows.map(r => `${r.moment}/${r.beat}`))] });
    console.log(`PASS rig=${fixture.rig} view=${fixture.view} ${fixture.kind}: ${candidate.rows.length} identical rows, zero sampling draws; bootstrap ${candidate.draws.warmup}`);
  }
} finally { await H.close(); }

// Ordinary callers keep their default drawing behavior and do not install the audit.
const ordinary = await startHarness();
try {
  const { page, errors } = await ordinary.openScene('quality=medium&mock=garage');
  const result = await page.evaluate(() => { window.__step(2); return { calls: window.__hitlRender.perf.calls, audit: typeof window.__drawAudit }; });
  assert(result.calls > 0);
  assert.equal(result.audit, 'undefined');
  assert.deepEqual(errors, []);
  console.log('PASS ordinary harness draws by default; absent-subject, missing-frame and impossible-rule controls fail');
} finally { await ordinary.close(); }
if (args.includes('--json')) writeFileSync(opt('--json'), JSON.stringify(reports, null, 2));
