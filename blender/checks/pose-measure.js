// Pose measures (pose.mjs): one character played through an animation or a gesture over it, stepped
// at a fixed rate, and measured each frame from its geometry. The same module runs in Node (pose.mjs)
// and in a harness page (pose.mjs --check-browser), so the two can be compared number for number.
//
// playPose({ under, gesture, seconds, warm, fps, yawToCamera, view, seated, look }) -> { frames, info }
//   under        the animation the person is in (typing, idle, ...); a gesture plays over it
//   gesture      a gesture name (character.gesture), or null to measure `under` alone
//   seconds      how long the gesture lasts; the run covers it and 0.5 s after
//   warm         seconds of `under` before the gesture (the pose eases in from it, as in the game)
//   yawToCamera  the person's heading off the camera, degrees (0 faces the camera)
//   view         camera turns (n presses of E) for the facing angle
//   rig          the authored clips on (the game's Medium and High default) or off (Low, ?rig=0)
// Each frame: { t, phase ('warm' | 'gesture' | 'after'), anim, eyes, forward, head, hands,
//   contact: { hand0Face, hand0Head, hand0HeadTop, hand1Face, ... }, faceCam }. hand0 is the character's
//   probe().hands[0] (the rig's armL, arms[0]), hand1 hands[1] (armR).
// Distances are metres from a hand's centre to the nearest point of the surface named: face is the
// half of the head the face points out of, headTop the top quarter of the head, head all of it.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { createCharacter } from '/src/render/character.js';
import { faceLandmarks, landmarkContacts } from './pose-landmarks.js';
import { loadModels, getTemplate } from '/src/render/models.js';
import { setRigEnabled } from '/src/render/rig.js';

const PITCH = Math.atan(1 / Math.SQRT2);   // the game camera's pitch (camera.js)
const START_YAW = Math.PI / 4;             // its yaw before any turn

// The camera's direction toward itself from the scene, for view n (as camera.js viewDir).
function toCamera(view) {
  const y = START_YAW + (view * Math.PI) / 2;
  return new THREE.Vector3(Math.sin(y) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(y) * Math.cos(PITCH));
}

// The head's triangles in world space, sorted into the named surfaces, each with a BVH.
function headSurfaces(c, headCenter, forward) {
  const pos = [], front = [], top = [];
  let maxY = -Infinity, minY = Infinity;
  const a = new THREE.Vector3(), d = new THREE.Vector3();
  const tris = [];
  c.head.updateMatrixWorld(true);
  c.head.traverse((m) => {
    if (!m.isMesh || !m.visible || !m.geometry?.attributes?.position) return;
    const g = m.geometry, p = g.attributes.position, idx = g.index;
    const n = idx ? idx.count : p.count;
    for (let i = 0; i < n; i += 3) {
      const v = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(p, idx ? idx.getX(i + k) : i + k).applyMatrix4(m.matrixWorld));
      tris.push(v);
      for (const q of v) { maxY = Math.max(maxY, q.y); minY = Math.min(minY, q.y); }
    }
  });
  const cut = maxY - (maxY - minY) / 4;
  for (const v of tris) {
    const cen = a.copy(v[0]).add(v[1]).add(v[2]).multiplyScalar(1 / 3);
    const flat = v.flatMap((q) => [q.x, q.y, q.z]);
    pos.push(...flat);
    if (d.copy(cen).sub(headCenter).dot(forward) > 0) front.push(...flat);
    if (cen.y >= cut) top.push(...flat);
  }
  const bvh = (arr) => {
    if (!arr.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    return new MeshBVH(g);
  };
  return { head: bvh(pos), face: bvh(front), headTop: bvh(top) };
}
const target = { point: new THREE.Vector3(), distance: 0 };
const dist = (bvh, p) => (bvh ? bvh.closestPointToPoint(p, target) && +target.distance.toFixed(4) : null);

export async function playPose({ under = 'idle', gesture = null, seconds = 2.2, warm = 1, fps = 30, yawToCamera = 0, view = 0, rig = true, look = {}, seed = 'pose' } = {}) {
  await loadModels(['chibi']);
  await setRigEnabled(rig);
  const landmarks = faceLandmarks(getTemplate('chibi'));
  const c = createCharacter(look, undefined, { seed });
  if (gesture && typeof c.gesture !== 'function') throw new Error("pose: this checkout's characters have no gesture()");
  const toCam = toCamera(view);
  // Heading: yaw 0 faces +z; the camera sits along toCam.
  c.root.rotation.y = Math.atan2(toCam.x, toCam.z) + THREE.MathUtils.degToRad(yawToCamera);
  c.setAnim(under);
  const dt = 1 / fps, frames = [];
  const total = warm + (gesture ? seconds + 0.5 : seconds);
  let t = 0, started = false;
  for (let i = 0; t < total - 1e-9; i++) {
    if (gesture && !started && t >= warm - 1e-9) { c.gesture(gesture, seconds); started = true; }
    c.update(dt);
    t = +(t + dt).toFixed(6);
    c.root.updateMatrixWorld(true);
    const p = c.probe();
    const S = headSurfaces(c, p.head, p.forward);
    const phase = !gesture || t <= warm + 1e-9 ? (gesture ? 'warm' : 'pose') : t <= warm + seconds + 1e-9 ? 'gesture' : 'after';
    frames.push({
      t, phase, anim: p.anim,
      eyes: p.eyes.toArray().map((v) => +v.toFixed(4)), forward: p.forward.toArray().map((v) => +v.toFixed(4)),
      head: p.head.toArray().map((v) => +v.toFixed(4)), hands: p.hands.map((h) => h.toArray().map((v) => +v.toFixed(4))),
      contact: { ...landmarkContacts(landmarks, c.head.matrixWorld, p.hands), ...Object.fromEntries([0, 1].flatMap((h) => [[`hand${h}Face`, dist(S.face, p.hands[h])], [`hand${h}Head`, dist(S.head, p.hands[h])], [`hand${h}HeadTop`, dist(S.headTop, p.hands[h])]])) },
      faceCam: +THREE.MathUtils.radToDeg(p.forward.angleTo(toCam)).toFixed(1),
    });
  }
  return { frames, info: { under, gesture, seconds, warm, fps, yawToCamera, view, rig, hasGesture: typeof c.gesture === 'function' } };
}
