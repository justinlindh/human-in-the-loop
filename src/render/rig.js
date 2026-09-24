import * as THREE from 'three';
import { getTemplate, loadModels } from './models.js';

// Authored character clips from chibi_rig.glb (blender/characters/chibi_rig.py), converted once
// into tracks for the pivot groups character.js builds, so an AnimationMixer per character plays
// them directly. A bone's motion becomes the change from its rest pose, expressed in its parent's
// frame, so the bones' own rest orientation never matters.
//
// rigClips() -> Map(name -> AnimationClip) | null   null until the model has loaded (setRigEnabled)
// Pivots are named `rig_<bone>`: body (the only one that moves), hips, legL, legR, torso, head, armL, armR.

export const RIG_BONES = ['body', 'hips', 'legL', 'legR', 'torso', 'head', 'armL', 'armR'];
const FPS = 30;

let clips = null;
let enabled = false;

// The rig model downloads only once the rig is turned on. Resolves when its clips can play.
export function setRigEnabled(on) {
  enabled = !!on;
  return enabled ? loadRig() : Promise.resolve();
}
// Loads the rig model (once) without turning the rig on: some poses (dances) always use its clips.
export function loadRig() { return loadModels(['chibi_rig']); }
export function rigEnabled() { return enabled; }

function worldRest(root) {
  root.updateMatrixWorld(true);
  const out = {};
  root.traverse((o) => {
    if (!RIG_BONES.includes(o.name) || out[o.name]) return;
    const q = new THREE.Quaternion(); const p = new THREE.Vector3();
    o.matrixWorld.decompose(p, q, new THREE.Vector3());
    out[o.name] = { o, q, p };
  });
  return out;
}

function convert(tpl, clip) {
  const rig = tpl.clone(true);
  const rest = worldRest(rig);
  const parentOf = {};
  for (const name of RIG_BONES) {
    let p = rest[name]?.o.parent;
    while (p && !RIG_BONES.includes(p.name)) p = p.parent;
    parentOf[name] = p?.name ?? null;
  }
  const mixer = new THREE.AnimationMixer(rig);
  mixer.clipAction(clip).play();
  const n = Math.max(2, Math.round(clip.duration * FPS) + 1);
  const times = new Float32Array(n);
  const quats = Object.fromEntries(RIG_BONES.map((b) => [b, new Float32Array(n * 4)]));
  const pos = new Float32Array(n * 3);
  const q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const delta = {};
  for (let i = 0; i < n; i++) {
    const t = Math.min(clip.duration, i / FPS);
    times[i] = t;
    mixer.setTime(t);
    rig.updateMatrixWorld(true);
    for (const b of RIG_BONES) {
      const r = rest[b];
      if (!r) continue;
      r.o.matrixWorld.decompose(p, q, s);
      // World change since rest, then relative to the parent's change: the pivot's local rotation.
      delta[b] = q.clone().multiply(r.q.clone().invert());
      const local = parentOf[b] ? delta[parentOf[b]].clone().invert().multiply(delta[b]) : delta[b];
      local.toArray(quats[b], i * 4);
      if (b === 'body') p.sub(r.p).toArray(pos, i * 3);
    }
  }
  mixer.stopAllAction();
  const tracks = RIG_BONES.filter((b) => rest[b]).map((b) => new THREE.QuaternionKeyframeTrack(`rig_${b}.quaternion`, times, quats[b]));
  tracks.push(new THREE.VectorKeyframeTrack('rig_body.position', times, pos));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

export function rigClips() {
  if (clips) return clips;
  const tpl = getTemplate('chibi_rig');
  const src = tpl?.userData.clips;
  if (!src?.length) return null;
  clips = new Map(src.map((c) => [c.name, convert(tpl, c)]));
  return clips;
}
