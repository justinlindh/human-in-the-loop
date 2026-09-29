// The robot slap as a two-actor pose run: the fixer and the office robot at the game's slap spot, the
// fixer playing the slap anim, measured each frame from geometry. Same module in Node (pose.mjs --matrix)
// and in the lab page; it takes the game's own numbers (robot.js SLAP, character.js SLAP_AT), so a
// --param on either reaches it.
//
// createSlapRun({ build, rig, view, fps, look, seed }) -> { character, robot, step, done, total, info }
//   The robot stands at the origin; the fixer stands SLAP.radii[build] away, turned to the robot with the
//   game's SLAP.aside offset. `view` turns the pair by view x 90 degrees under the fixed game camera,
//   as the pose matrix turns one person.
// Each frame: { t, phase, anim, eyes, forward, head, hands, joints, contact, faceCam }
//   phase: 'warm' (squaring up, SLAP.turnS), 'windup' (the anim before SLAP_AT), 'gesture' (SLAP_AT to the
//   end of the anim: the frames the contact rule judges), 'after'.
//   contact.robotContact  metres from the fixer's right hand (hands[1]) to the robot head's box, the
//                         measure stage.mjs takes for the robot.slap beat
//   contact.robotDepth    metres the fixer's body is inside the robot (0 when clear)
//   contact.faceVisible   share of the fixer's seven face landmarks the camera sees
//   contact.robotAngle    degrees between the fixer's face direction and the robot head (stage's facingRobot)
import * as THREE from 'three';
import { createCharacter, SLAP_AT } from '/src/render/character.js';
import { buildRig, SLAP } from '/src/render/robot.js';
import { loadModels, getTemplate } from '/src/render/models.js';
import { setRigEnabled } from '/src/render/rig.js';
import { overlaps } from './intersect.js';
import { faceVisibility } from './pose-visibility.js';
import { coverCamera } from './pose-measure.js';

const AFTER_S = 1.1;   // how long the game keeps the fixer in the slap anim after SLAP_AT (robot.js temp t)
const PITCH = Math.atan(1 / Math.SQRT2);
const START_YAW = Math.PI / 4;
const TO_CAMERA = new THREE.Vector3(Math.sin(START_YAW) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(START_YAW) * Math.cos(PITCH));

// Distance from a hand point to the robot head's box: the stage's robotContact.
export const robotContact = (headObject, handAt) => new THREE.Box3().setFromObject(headObject).distanceToPoint(new THREE.Vector3(...handAt));

// Degrees between where the fixer's face points and the robot head: the stage's facingRobot angle.
function robotAngle(p, robotHead) {
  const to = new THREE.Box3().setFromObject(robotHead).getCenter(new THREE.Vector3()).sub(p.head);
  return +THREE.MathUtils.radToDeg(p.forward.angleTo(to)).toFixed(1);
}

function bodyOf(root, label) {
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isSprite || !o.visible || !o.geometry?.attributes?.position) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (m && m.transparent && m.opacity < 0.6) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    meshes.push(o);
  });
  return { key: label, kind: 'actor', label, id: null, box: new THREE.Box3().setFromObject(root), meshes };
}

export async function createSlapRun({ build = 1, rig = true, view = 0, fps = 30, look = {}, seed = 'slap' } = {}) {
  await loadModels(['chibi', 'robot']);
  await setRigEnabled(rig);
  const template = getTemplate('chibi');
  const pair = new THREE.Group();
  pair.rotation.y = (view * Math.PI) / 2;
  const robotRig = buildRig();
  pair.add(robotRig.root);
  const c = createCharacter({ ...look, build }, undefined, { seed });
  // The game tries SLAP.radii in order and takes the first clear ring, so an open floor gives the first.
  const r = SLAP.radii[0];
  c.root.position.set(0, 0, r);
  // Facing the robot from +z: heading pi, then the game's offset so the robot's head sits to the right.
  c.root.rotation.y = Math.PI - SLAP.aside;
  pair.add(c.root);
  const scene = new THREE.Scene();
  scene.add(pair);
  pair.updateMatrixWorld(true);
  const robotHead = robotRig.root.getObjectByName('robot_head') ?? robotRig.root;
  let headMesh = null;
  c.root.traverse((o) => { if (!headMesh && o.userData.part === 'head') headMesh = o; });
  let camera = null;
  const dt = 1 / fps;
  const total = SLAP.turnS + SLAP_AT + AFTER_S + 0.4;
  let t = 0, started = false;
  c.setAnim('idle');
  // The robot as robot.js holds it for the slap: turned an ear to the fixer (fixYaw), its head tipped away
  // (SLAP.cringe) from the moment the fixer is sent, then jolted when the hand lands. The jolt terms mirror
  // pose() in robot.js, which keeps them inside createRobot.
  const fixYaw = Math.atan2(0 - c.root.position.x, 0 - c.root.position.z) + Math.PI / 2;
  const fixSide = Math.sign(c.root.position.x * Math.cos(fixYaw) - c.root.position.z * Math.sin(fixYaw)) || 1;
  robotRig.root.rotation.y = fixYaw;
  robotRig.head.rotation.z = SLAP.cringe * fixSide;
  let jolt = 0, slapped = false;
  const step = () => {
    if (!started && t >= SLAP.turnS - 1e-9) { c.setAnim('slap'); started = true; }
    c.update(dt);
    t = +(t + dt).toFixed(6);
    if (!slapped && t - SLAP.turnS >= SLAP_AT) { slapped = true; jolt = 1; }
    let headZ = slapped ? Math.sin(t * 1.1) * 0.05 : SLAP.cringe * fixSide, lean = 0;
    if (jolt > 0) {
      jolt = Math.max(0, jolt - dt * 1.4);
      const j = jolt * jolt;
      headZ += Math.sin(t * 38) * 0.35 * j + 0.3 * j;
      lean -= 0.12 * j;
    }
    const k = 1 - Math.exp(-dt * 10);
    robotRig.head.rotation.z += (headZ - robotRig.head.rotation.z) * k;
    robotRig.torso.rotation.x += (lean - robotRig.torso.rotation.x) * k;
    pair.updateMatrixWorld(true);
    const p = c.probe();
    const j = c.joints?.() ?? null;
    const slapAge = t - SLAP.turnS;
    const phase = slapAge <= 0 ? 'warm' : slapAge < SLAP_AT ? 'windup' : slapAge <= SLAP_AT + AFTER_S ? 'gesture' : 'after';
    camera ??= coverCamera(TO_CAMERA, p.head);
    const depth = overlaps([bodyOf(c.root, 'fixer'), bodyOf(robotRig.root, 'robot')], { tol: 0 })[0]?.depth ?? 0;
    // Rays run against the pair only, so the answer is the same wherever a caller has put the pair.
    const vis = faceVisibility({ scene: pair, camera }, headMesh, template);
    return {
      t, phase, anim: p.anim,
      eyes: p.eyes.toArray().map((v) => +v.toFixed(4)), forward: p.forward.toArray().map((v) => +v.toFixed(4)),
      head: p.head.toArray().map((v) => +v.toFixed(4)), hands: p.hands.map((h) => h.toArray().map((v) => +v.toFixed(4))),
      joints: j && Object.fromEntries(Object.entries(j).map(([name, v]) => [name, v.toArray().map((n) => +n.toFixed(4))])),
      contact: { robotContact: +robotContact(robotHead, p.hands[1].toArray()).toFixed(4), robotDepth: +depth.toFixed(4), faceVisible: +vis.faceVisible.toFixed(3), robotAngle: robotAngle(p, robotHead) },
      faceCam: +THREE.MathUtils.radToDeg(p.forward.angleTo(TO_CAMERA)).toFixed(1),
    };
  };
  return { character: c, robot: robotRig, scene, pair, step, done: () => t >= total - 1e-9, total, info: { gesture: 'slap', build, rig, view, fps, radius: r, hasGesture: true } };
}

export async function playSlap(opts = {}) {
  const run = await createSlapRun(opts);
  const frames = [];
  while (!run.done()) frames.push(run.step());
  return { frames, info: run.info };
}

// playPose with the slap added: the matrix and the single run pass every gesture through this, and the
// gesture named 'slap' plays as the two-actor run (the view is yawToCamera / 90, the build and rig as given).
export const withSlap = (playPose) => (o = {}) => (o.gesture === 'slap'
  ? playSlap({ build: o.look?.build ?? 1, rig: o.rig ?? true, view: Math.round((o.yawToCamera ?? 0) / 90), fps: o.fps ?? 30, look: o.look })
  : playPose(o));
