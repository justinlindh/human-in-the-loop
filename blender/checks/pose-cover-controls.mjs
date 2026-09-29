// Controls for the screen-space cover measures (pose-cover.js): each case runs pose.mjs --scene on the
// floor mock and checks the exit code and verdict line.
//   node blender/checks/pose-cover-controls.mjs
// Takes the render lock through pose.mjs; run under timeout and nice.
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const POSE = resolve(dirname(fileURLToPath(import.meta.url)), 'pose.mjs');
const FACEPALM = ['--event', '{"type":"posted","outcome":"backfired"}'];
const scene = (...args) => {
  const r = spawnSync(process.execPath, [POSE, '--scene', '--mock', 'floor', '--clip', '2', '--every', '6', ...args], { encoding: 'utf8', timeout: 300000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
let failures = 0;
const control = (name, fn) => { try { fn(); console.log(`ok   ${name}`); } catch (e) { failures++; console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`); } };

// The floor mock's facepalmer is s3, standing and facing the camera.
let r = scene(...FACEPALM, '--who', 's3', '--expect', 's3:coverHandEyeNear>=0.5@0.5');
control('a facepalm covers the camera-side eye: rule passes', () => { assert.equal(r.code, 0, r.out); assert.match(r.out, /POSE ok   s3 s3:coverHandEyeNear>=0\.5@0\.5/); assert.match(r.out, /A in front/); });

r = scene('--who', 's3', '--expect', 's3:coverHandEyeNear>=0.5@0.5');
control('the same person typing, no hand near the face: rule fails, B clear', () => { assert.equal(r.code, 1); assert.match(r.out, /POSE FAIL s3/); assert.match(r.out, /B clear/); });

r = scene(...FACEPALM, '--who', 's3', '--expect', 's3:coverHandLEyeNear>=0.5@0.5', '--expect', 's3:coverHandREyeNear>=0.5@0.5');
control('left and right hand are told apart: one covers, the other does not', () => { const pass = (r.out.match(/POSE ok/g) ?? []).length, fail = (r.out.match(/POSE FAIL s3/g) ?? []).length; assert.equal(pass, 1, r.out); assert.equal(fail, 1, r.out); });

r = scene(...FACEPALM, '--who', 's3', '--expect', 's3:coverHandEyeFar>=0.9@0.5');
control('the far eye is a different target from the near one', () => { assert.equal(r.code, 1); assert.match(r.out, /coverHandEyeFar/); });

r = scene('--who', 's3', '--expect', 's3:coverHandNothing>=0.5');
control('an unknown cover measure is refused', () => { assert.notEqual(r.code, 0); assert.match(r.out, /can't read scene rule/); });

r = spawnSync(process.execPath, [POSE, '--scene', '--seed', '62', '--week', '40', '--warm', '0', '--frames', '1', '--patch-js', 'throw new Error("WEEK=" + S.week)'], { encoding: 'utf8', timeout: 300000 });
control('--week stages the seeded game at that week', () => { assert.match(`${r.stdout}${r.stderr}`, /WEEK=40/); });

console.log(failures ? `pose-cover-controls: ${failures} control(s) failed` : 'pose-cover-controls: all controls pass');
process.exit(failures ? 1 : 0);
