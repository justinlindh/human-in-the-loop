// Stand-in for scripts/tools/mocap/worker/track_worker.py: same arguments, writes a minimal valid shot file.
// STUB_LOG appends one line per run; STUB_FAIL exits non-zero; STUB_BAD writes unparseable output;
// STUB_SLEEP waits that many ms first (for interrupt tests).
import { appendFileSync, writeFileSync } from 'node:fs';
const a = process.argv.slice(2);
const get = (k) => a[a.indexOf(`--${k}`) + 1];
if (process.env.STUB_LOG) appendFileSync(process.env.STUB_LOG, `${get('frame-offset')} ${a.includes('--no-camera') ? 'nocam' : 'cam'}\n`);
if (process.env.STUB_SLEEP) await new Promise((r) => setTimeout(r, Number(process.env.STUB_SLEEP)));
if (process.env.STUB_FAIL) process.exit(3);
if (process.env.STUB_BAD) { writeFileSync(get('out'), '{not json'); process.exit(0); }
writeFileSync(get('out'), JSON.stringify({
  format: 'hitl-mocap-shot', version: 1,
  shot: { start_frame: Number(get('frame-offset')), frames: 1, fps: Number(get('fps')), width: Number(get('width')), height: Number(get('height')) },
  joints: ['Hips'], parents: [-1], camera: { source: 'static', w2c: [] },
  people: [{ id: 0, observed: [1], rot_local: [[[0, 0, 0, 1]]], root_orient_cam: [[0, 0, 0, 1]], root_pos_cam: [[0, 0, 3]], joint_pos_world: [[[0, 1, 0]]], trust: [[1]] }],
}));
