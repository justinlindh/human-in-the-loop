import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { getTemplate } from './models.js';
import { mat, color, paletteMaterial } from './materials.js';
import { ROLE_COLORS, PALETTE } from './palette.js';
import { characterLook } from './look.js';
import { emoteMaterial } from './emotes.js';
import { bakedMaterial, bakeParts } from './bake.js';
import { rigClips, rigEnabled } from './rig.js';

// Chibi assembly from the named parts in chibi.glb, animated with plain transforms.
// Pivots: neck (head parts), waist (torso parts), shoulder (arm), wrist (hand), hip (leg), ankle (shoe).

const LEG_L = 0.25;
const SHOE_H = 0.06;
const HIP_Y = LEG_L + SHOE_H;
const TORSO_H = 0.30;
const BUILD_W = [0.26, 0.3, 0.36];
const SEAT_HIP_Y = 0.47;
const HEAD_TOP = HIP_Y + TORSO_H + 0.43;

const ANIMS = ['idle', 'typing', 'walk', 'run', 'slumped', 'burnout', 'celebrate', 'sip', 'eat', 'recoil', 'peer', 'shoulder', 'swing', 'sigh', 'fan', 'despair', 'readpaper', 'slump', 'fanfrantic', 'wave', 'carry',
  'lie', 'sit', 'sprawl', 'play', 'paddle', 'browse', 'water', 'groan', 'playsit', 'read', 'nap', 'tired', 'desknap', 'point', 'press', 'whisper', 'shake',
  'dance_polka', 'dance_robot', 'dance_bossa', 'dance_lofi', 'dance_bob', 'dance_stiff'];
// Dances always play their authored clips (rig on or off); the procedural pose is a stand-in bounce
// for the moment before the rig model has loaded.
const ALWAYS_CLIP = /^dance_/;
// Shoulder angle that puts seated hands on the keys, before subtracting the pose's forward lean.
const TYPE_REACH = -1.32;
const BLEND_S = 0.3;
// Ground speed of the walk clip at its authored rate (chibi_rig.py): playback scales from it with
// the walker's speed so feet do not slide.
const WALK_CLIP_SPEED = 0.875;
const LYING = new Set(['lie', 'nap', 'sprawl']);
// Mood (and ':closed') -> face geometry shared by every character. Shared geometry bakes its
// colours in, so face parts must use fixed palette colours only, never a per-person colour.
const FACE_GEOS = new Map();
const SLEEPING = new Set(['lie', 'nap', 'desknap']);
const SEATED = new Set(['typing', 'slumped', 'burnout', 'sit', 'sprawl', 'playsit', 'read', 'tired', 'desknap', 'recoil', 'sigh']);

const roleMats = new Map();
function roleMaterial(role, hex) {
  const key = role ?? hex;
  let m = roleMats.get(key);
  if (!m) {
    m = ROLE_COLORS[role] ? mat(`role_${role}`) : new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.7 });
    roleMats.set(key, m);
  }
  return m;
}
const ringMats = new Map();
function ringMaterial(role, hex) {
  const key = role ?? hex;
  let m = ringMats.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: new THREE.Color(ROLE_COLORS[role] ?? hex), transparent: true, opacity: 0.55, depthWrite: false });
    ringMats.set(key, m);
  }
  return m;
}
const ringGeo = new THREE.RingGeometry(0.27, 0.33, 32).rotateX(-Math.PI / 2);
const HAND_TIP = new THREE.Vector3(0, -0.06, 0);   // the hand's centre below the wrist pivot
const boxGeo = new RoundedBoxGeometry(0.34, 0.24, 0.26, 2, 0.025);
// Pizza slice: a wedge pointing at the mouth (-z) with a rounded crust along its back.
const SLICE_GEO = new THREE.CylinderGeometry(0.075, 0.075, 0.012, 3, 1, false, -Math.PI / 6, Math.PI / 3).translate(0, 0, -0.02);
const CRUST_GEO = new THREE.CapsuleGeometry(0.012, 0.07, 4, 8).rotateZ(Math.PI / 2);
const pickGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.15, 8).translate(0, 0.58, 0);
let haloMat = null;

// Cheeks: soft radial-gradient discs on the blush part's two cheek positions, tinted a warmer,
// deeper shade of the person's own skin. Lighter skin shows a light flush; darker skin a faint one.
// Cheeks never flush for now; set true to bring back the flush as an expression.
const CHEEK_FLUSH = false;
const WARM_EMOTES = new Set(['heart', 'sparkle']);
let cheekTex = null;
function cheekTexture() {
  if (cheekTex) return cheekTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  cheekTex = new THREE.CanvasTexture(c);
  return cheekTex;
}
function flushColor(skin) {
  const hsl = {};
  skin.getHSL(hsl);
  const c = new THREE.Color().setHSL((hsl.h + 0.98) % 1, Math.min(0.7, hsl.s * 1.15 + 0.08), hsl.l * 0.72);
  return c;
}
function makeCheeks(tpl, skin) {
  const group = new THREE.Group();
  const src = tpl?.getObjectByName('blush');
  const l = skin.r * 0.2126 + skin.g * 0.7152 + skin.b * 0.0722;
  const peak = THREE.MathUtils.clamp(0.1 + l * 0.9, 0.12, 0.5);   // linear luminance: dark skin ~0.12
  const m = new THREE.MeshBasicMaterial({ map: cheekTexture(), color: flushColor(skin), transparent: true, opacity: 0, depthWrite: false, toneMapped: true });
  if (src) {
    // Two cheek centres from the blush part's vertices, split by side; each disc faces outward.
    let geo = null;
    src.traverse((o) => { if (!geo && o.isMesh) geo = o; });
    const pos = geo.geometry.attributes.position;
    const sides = [[0, 0, 0, 0], [0, 0, 0, 0]];
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(geo.matrix);
      const k = v.x < 0 ? 0 : 1;
      sides[k][0] += v.x; sides[k][1] += v.y; sides[k][2] += v.z; sides[k][3]++;
    }
    const centre = new THREE.Box3().setFromBufferAttribute(pos).getCenter(new THREE.Vector3()).applyMatrix4(geo.matrix);
    for (const [x, y, z, n] of sides) {
      if (!n) continue;
      const p = new THREE.Vector3(x / n, y / n, z / n);
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.075), m);
      d.position.copy(p);
      const out = p.clone().sub(new THREE.Vector3(0, centre.y, centre.z - 0.1)).normalize();
      d.lookAt(p.clone().add(out));
      d.position.addScaledVector(out, 0.004);
      d.renderOrder = 2;
      d.userData.noAO = true;
      d.castShadow = false;
      group.add(d);
    }
  }
  group.visible = false;
  return {
    group,
    set(k) { m.opacity = peak * k; group.visible = k > 0.01; },
    dispose() { m.dispose(); },
  };
}
const haloGeo = new THREE.TorusGeometry(0.14, 0.022, 8, 28).rotateX(Math.PI / 2);

// Parts are modeled in their pivot's space, so the node transform from the file is kept as is.
function part(tpl, name) {
  const o = tpl.getObjectByName(name);
  return o ? o.clone(true) : new THREE.Group();
}

// A small generator for one character's animation timing (phase, blinks, breaths). Seeded from the
// staff id, a person moves the same way however much else was randomised before they appeared.
function timingRandom(seed) {
  if (seed == null) return Math.random;
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let x = Math.imul(h ^ (h >>> 15), 1 | h);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function createCharacter(appearance = {}, roleColor = PALETTE.role_engineer, opts = {}) {
  const rand = timingRandom(opts.seed);
  // Parts shown only now and then are detached while hidden, so the per-frame matrix pass skips them.
  const attach = (o, parent, on) => { if (on && o.parent !== parent) parent.add(o); else if (!on && o.parent) o.removeFromParent(); };
  const tpl = getTemplate('chibi');
  const role = opts.role ?? null;
  const look = characterLook(appearance, role, roleColor);
  const build = look.build;
  // Support's headset is its headwear: no hat or headphones over it (glasses are fine).
  const acc = look.accessory;
  const hairIdx = look.hair;
  // Headphones press curly hair flat under the band; long hair covers the hood of a hoodie.
  const hairPart = hairIdx === 6 && acc === 'headphones' ? 'hair_6_hp' : `hair_${hairIdx}`;
  const hat = acc === 'beanie' || acc === 'cap';

  // Per-character materials (tintable); everything else is shared.
  const own = {
    skin: new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...look.linear.skin), roughness: 0.75 }),
    hair: new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...look.linear.hairColor), roughness: 0.6 }),
    shirt: new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...look.linear.shirt), roughness: 0.85 }),
    pants: new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...look.linear.pants), roughness: 0.85 }),
  };
  const base = Object.fromEntries(Object.entries(own).map(([k, m]) => [k, m.color.clone()]));
  const roleMat = roleMaterial(role, roleColor);

  // Only the big shapes cast shadows. Everything but the tiny face and badge details stays in the
  // AO depth pass: AO is applied from that depth, so a part missing from it gets the shading of
  // whatever is behind it and reads as see-through.
  function skinMats(o, cast = false, ao = true) {
    o.traverse((m) => {
      if (!m.isMesh) return;
      const pick = (mm) => {
        const n = (mm?.name ?? '').toLowerCase();
        if (n.startsWith('pal_skin')) return own.skin;
        if (n.startsWith('pal_hair')) return own.hair;
        if (n.startsWith('pal_shirt')) return own.shirt;
        if (n.startsWith('pal_pants')) return own.pants;
        if (n.startsWith('pal_role')) return roleMat;
        return paletteMaterial(mm?.name) ?? mm;
      };
      m.material = Array.isArray(m.material) ? m.material.map(pick) : pick(m.material);
      m.castShadow = cast;
      m.receiveShadow = true;
      if (!ao) m.userData.noAO = true;
    });
    return o;
  }
  const CASTERS = /^(head|hair_|torso_|leg|acc_beanie|acc_cap)/;
  const TINY = /^(eyes|eye_shine|blush|mouth_|lanyard|badge)/;
  const P = (name) => (tpl ? skinMats(part(tpl, name), CASTERS.test(name), !TINY.test(name)) : new THREE.Group());

  const root = new THREE.Group();
  root.name = 'character';
  const body = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = HIP_Y;
  root.add(body);
  body.add(hips);

  const legs = [-1, 1].map((sx) => {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.075 * (0.85 + build * 0.12), 0, 0);
    const leg = P('leg');
    const shoe = P('shoe');
    shoe.position.y = -LEG_L;
    pivot.add(leg, shoe);
    hips.add(pivot);
    pivot.userData.parts = [leg, shoe];
    return pivot;
  });

  const torso = new THREE.Group();
  hips.add(torso);
  const torsoMesh = P(`torso_${build}`);
  torso.add(torsoMesh);
  const wScale = BUILD_W[build] / BUILD_W[1];
  const lanyard = P('lanyard');
  const badge = P('badge');
  const bdepth = [0.9, 1, 1.15][build];
  lanyard.scale.set(wScale, 1, bdepth);
  badge.position.z = (bdepth - 1) * 0.115;
  torso.add(lanyard, badge);
  const torsoParts = [torsoMesh, lanyard, badge];
  if (role && role !== 'support') {
    const g = P(look.garment === 'hood_tucked' ? 'role_engineer_tucked' : `role_${role}`);
    g.scale.set(wScale, 1, bdepth);
    torso.add(g);
    torsoParts.push(g);
  }

  const neck = new THREE.Group();
  neck.position.y = TORSO_H - 0.01;
  torso.add(neck);
  const headGroup = new THREE.Group();
  neck.add(headGroup);
  const headParts = [P('head')];
  headGroup.add(headParts[0]);
  const eyes = P('eyes');
  // Where the eyes are in the head's frame (the part is modelled in place), for staging checks.
  eyes.geometry.computeBoundingBox();
  const eyeLocal = eyes.geometry.boundingBox.getCenter(new THREE.Vector3()).add(eyes.position);
  const shine = P('eye_shine');
  const mouths = { ok: P('mouth_smile'), coasting: P('mouth_flat'), burnout: P('mouth_frown') };
  headGroup.add(eyes, shine, mouths.ok, mouths.coasting, mouths.burnout);
  const cheeks = makeCheeks(tpl, own.skin.color);
  if (CHEEK_FLUSH) headGroup.add(cheeks.group);
  // A hat replaces the hair; drawing both makes them fight through each other.
  if (!hat) { const h = P(hairPart); headGroup.add(h); headParts.push(h); }
  if (acc !== 'none') {
    const a = P(`acc_${acc}`);
    // Hats take a colour picked from the person's look, so a row of cap wearers are not clones.
    if (hat) {
      const pickHat = look.hatName;
      const body = new Set([mat('fabric_teal'), mat('fabric_terracotta')]);
      a.traverse((m) => { if (m.isMesh && body.has(m.material)) m.material = mat(pickHat); });
    }
    // Most caps face forward; about one person in four wears theirs backwards.
    if (look.capBack) a.rotateY(Math.PI);
    headGroup.add(a);
    headParts.push(a);
  }
  if (role === 'support') { const h = P('role_support'); headGroup.add(h); headParts.push(h); }

  const arms = [-1, 1].map((sx) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(sx * (BUILD_W[build] / 2 + 0.03), TORSO_H - 0.06, 0);
    const arm = P('arm');
    const wrist = new THREE.Group();
    wrist.position.y = -0.2;
    const hand = P('hand');
    wrist.add(hand);
    shoulder.add(arm, wrist);
    torso.add(shoulder);
    return { shoulder, wrist, parts: [arm, hand] };
  });
  const mug = P('mug');
  mug.position.set(0, -0.06, 0.04);
  const mugParent = arms[1].wrist;
  // A slice of pizza for 'eat', held like the mug: a flat wedge, crust out.
  const slice = new THREE.Group();
  const cheese = new THREE.Mesh(SLICE_GEO, mat('fabric_mustard'));
  const crust = new THREE.Mesh(CRUST_GEO, mat('wood_honey'));
  crust.position.set(0, 0, 0.055);
  slice.add(cheese, crust);
  slice.position.set(0, -0.07, 0.05);
  slice.rotation.set(0.3, 0, 0);

  const box = new THREE.Mesh(boxGeo, mat('cardboard'));
  box.position.set(0, TORSO_H * 0.35, 0.24);
  box.castShadow = true;
  const boxParent = torso;

  // The pivots authored clips drive (rig.js bone names).
  const pivots = { body, hips, legL: legs[0], legR: legs[1], torso, head: headGroup, armL: arms[0].shoulder, armR: arms[1].shoulder };
  const pivotList = Object.values(pivots);

  // Bake the rigid parts under each pivot into one mesh (about 10 draws a person, not 20).
  const bm = bakedMaterial();
  const ownSet = new Set(Object.values(own));
  const tintable = (m) => ownSet.has(m);
  const baked = [];
  for (const l of legs) baked.push(bakeParts(l.userData.parts, l, bm, tintable));
  baked.push(bakeParts(torsoParts, torso, bm, tintable));
  baked.push(bakeParts(headParts, headGroup, bm, tintable));
  for (const a of arms) baked.push(bakeParts(a.parts, a.shoulder, bm, tintable));
  ['legL', 'legR', 'torso', 'head', 'armL', 'armR'].forEach((n, i) => { if (baked[i]) baked[i].userData.part = n; });
  // Faces: eyes, eye shine and mouth baked into one mesh per mood, with the eyes open or closed.
  // Only the face in use is attached; the mood picks the set and a blink swaps open for closed.
  // Face geometry is the same for everyone, so it is baked once and shared (the per-person tint
  // lives on the material).
  const faces = {};
  for (const k of ['ok', 'coasting', 'burnout']) {
    for (const closed of [false, true]) {
      const key = `${k}${closed ? ':closed' : ''}`;
      let geo = FACE_GEOS.get(key);
      if (!geo) {
        const e = eyes.clone();
        e.scale.y = closed ? 0.15 : 1;
        const parts = [e, mouths[k].clone()];
        if (!closed) parts.push(shine.clone());
        headGroup.add(...parts);
        const once = bakeParts(parts, headGroup, bm, tintable);
        once.removeFromParent();
        geo = once.geometry;
        geo.userData.shared = true;
        FACE_GEOS.set(key, geo);
      }
      const f = new THREE.Mesh(geo, bm);
      f.name = 'baked';
      f.receiveShadow = true;
      f.userData.noAO = true;
      faces[key] = f;
      baked.push(f);
    }
  }
  for (const o of [eyes, shine, ...Object.values(mouths)]) o.removeFromParent();
  let faceMood = 'ok';
  let faceClosed = false;
  const showFace = () => { for (const [k, o] of Object.entries(faces)) attach(o, headGroup, k === `${faceMood}${faceClosed ? ':closed' : ''}`); };
  // Wrists hold nothing once the hands are baked into the arms; only the right one carries the mug.
  arms[0].wrist.removeFromParent();

  // Invisible hit proxy for picking (raycasts ignore visibility, rendering skips it).
  const pickProxy = new THREE.Mesh(pickGeo, new THREE.MeshBasicMaterial());
  pickProxy.visible = false;
  pickProxy.userData.noAO = true;
  root.add(pickProxy);

  const ring = new THREE.Mesh(ringGeo, ringMaterial(role, roleColor));
  ring.position.y = 0.012;
  ring.renderOrder = 1;
  root.add(ring);

  const emote = new THREE.Sprite(emoteMaterial('sparkle'));
  emote.position.y = HEAD_TOP + 0.3;
  emote.center.set(0.5, 0.1);
  emote.visible = false;
  emote.renderOrder = 10;

  let halo = null;

  // Animation state
  let anim = 'idle';
  let t = rand() * 10;
  let animT = 0;
  let blinkIn = 2 + rand() * 3;
  let blinkT = 0;
  let emoteKind = null;
  let emoteT = 0;
  let tint = 0;
  let mood = 'ok';
  let tired = false;
  let flush = 0;
  let flushFor = 0;
  const cur = { bodyY: 0, bodyZ: 0, pitch: 0, lean: 0, headX: 0, headZ: 0, legL: 0, legR: 0, armLX: 0, armLZ: 0.1, armRX: 0, armRZ: -0.1, squash: 1, twist: 0 };
  const tgt = { ...cur };
  const phase = rand() * Math.PI * 2;

  // Authored clips: when the rig is on and has a clip for this pose, a mixer plays it. The mixer
  // animates a bare proxy of the pivots that is copied onto them each frame (it skips writing
  // values that have not changed since its last write, so it must own what it animates).
  // Switching between a clip and the procedural pose, either way, blends over BLEND_S from the
  // pivots' last transforms, so nothing pops.
  let mixer = null;
  let proxy = null;
  let rigClip = null;
  let rigAction = null;
  let moveSpeed = WALK_CLIP_SPEED;
  let blendT = BLEND_S;
  const snap = pivotList.map(() => ({ q: new THREE.Quaternion(), p: new THREE.Vector3() }));
  const tmpQ = new THREE.Quaternion();
  // Variants the clips do not cover stay procedural: the drooping idle and the tired walk.
  const RIG_PROCEDURAL = { idle: () => tired || mood === 'coasting', walk: () => tired };
  function rigPose(dt) {
    const clip = (rigEnabled() || ALWAYS_CLIP.test(anim)) && !RIG_PROCEDURAL[anim]?.() ? rigClips()?.get(anim) ?? null : null;
    if (clip !== rigClip) {
      pivotList.forEach((o, i) => { snap[i].q.copy(o.quaternion); snap[i].p.copy(o.position); });
      blendT = 0;
      mixer?.stopAllAction();
      rigClip = clip;
      if (clip) {
        if (!proxy) {
          proxy = new THREE.Group();
          for (const k of Object.keys(pivots)) { const g = new THREE.Group(); g.name = `rig_${k}`; proxy.add(g); }
          mixer = new THREE.AnimationMixer(proxy);
        }
        const a = mixer.clipAction(clip);
        rigAction = a;
        a.play();
        a.time = (phase / (Math.PI * 2)) * clip.duration;
      }
    }
    if (!clip) return false;
    rigAction.timeScale = anim === 'walk' ? Math.min(2.5, Math.max(0.5, moveSpeed / WALK_CLIP_SPEED)) : animRate;
    mixer.update(dt);
    proxy.children.forEach((g, i) => { pivotList[i].quaternion.copy(g.quaternion); });
    body.position.copy(proxy.children[0].position);
    return true;
  }
  function blendIn(dt) {
    if (blendT >= BLEND_S) return;
    blendT += dt;
    const k = Math.min(1, blendT / BLEND_S);
    const e = k * k * (3 - 2 * k);
    pivotList.forEach((o, i) => {
      tmpQ.copy(o.quaternion);
      o.quaternion.slerpQuaternions(snap[i].q, tmpQ, e);
      o.position.lerpVectors(snap[i].p, o.position.clone(), e);
    });
  }

  function pose(dt) {
    const s = Math.sin;
    Object.assign(tgt, { bodyY: 0, bodyZ: 0, pitch: 0, lean: 0, headX: 0, headZ: 0, legL: 0, legR: 0, armLX: 0, armLZ: 0.12, armRX: 0, armRZ: -0.12, squash: 1, twist: 0 });
    const seated = SEATED.has(anim);
    if (seated) {
      tgt.bodyY = SEAT_HIP_Y - HIP_Y;
      tgt.legL = tgt.legR = -1.45;
    }
    switch (anim) {
      case 'idle':
        tgt.bodyY = s(t * 2.2 + phase) * 0.006;
        tgt.headZ = s(t * 0.7 + phase) * 0.06;
        tgt.armLX = s(t * 1.1) * 0.05;
        tgt.armRX = -s(t * 1.1) * 0.05;
        break;
      case 'typing': {
        tgt.lean = 0.18;
        tgt.headX = 0.12 + s(t * 1.3 + phase) * 0.04;
        tgt.armLX = tgt.armRX = TYPE_REACH - 0.18;
        tgt.armLZ = 0.18; tgt.armRZ = -0.18;
        // Fingers tap: the hands lift off the keys and come back down, never below them.
        tgt.armLX -= Math.abs(s(t * 22)) * 0.06;
        tgt.armRX -= Math.abs(s(t * 22 + 2)) * 0.06;
        tgt.bodyY += Math.abs(s(t * 11)) * 0.004;
        break;
      }
      case 'slumped':
        // Leaning poses sit back in the chair so the torso stays clear of the desk edge.
        tgt.bodyZ = -0.06;
        tgt.lean = 0.42;
        tgt.headX = 0.5 + s(t * 0.6 + phase) * 0.05;
        tgt.headZ = 0.12;
        // Arm angles are relative to the leaning torso: hands rest on the keys, typing slowly.
        tgt.armLX = tgt.armRX = TYPE_REACH - 0.42 - 0.22;
        tgt.armLZ = 0.22; tgt.armRZ = -0.22;
        tgt.armLX -= Math.abs(s(t * 5)) * 0.05;
        tgt.bodyY -= 0.03;
        break;
      case 'burnout': {
        const sigh = Math.max(0, s(t * 1.4 + phase)) ** 6;
        tgt.bodyZ = -0.12;
        tgt.lean = 0.52 - sigh * 0.2;
        tgt.headX = 0.45;
        tgt.headZ = 0.35;
        // Head down on folded arms that lie on the desk.
        tgt.armLX = tgt.armRX = -2.6;
        tgt.armLZ = 0.55; tgt.armRZ = -0.55;
        tgt.bodyY -= 0.02 - sigh * 0.03;
        break;
      }
      case 'walk':
      case 'run': {
        const run = anim === 'run';
        const f = run ? 13 : tired ? 6 : 8;
        const a = run ? 0.75 : 0.45;
        tgt.legL = s(t * f) * a;
        tgt.legR = -s(t * f) * a;
        tgt.armLX = -s(t * f) * a * 0.9;
        tgt.armRX = s(t * f) * a * 0.9;
        tgt.bodyY = Math.abs(s(t * f)) * (run ? 0.05 : 0.025);
        tgt.lean = run ? 0.22 : tired ? 0.2 : 0.04;
        if (tired && !run) { tgt.headX = 0.25; tgt.armLZ = 0.05; tgt.armRZ = -0.05; }
        tgt.twist = s(t * f) * 0.08;
        break;
      }
      case 'celebrate': {
        const j = Math.max(0, s(t * 7));
        tgt.bodyY = j * 0.22;
        tgt.squash = j > 0.02 ? 1 + j * 0.06 : 0.9;
        tgt.armLZ = -2.7 + s(t * 14) * 0.15;
        tgt.armRZ = 2.7 - s(t * 14) * 0.15;
        tgt.headX = -0.15;
        break;
      }
      case 'sip': {
        const cyc = (t % 4) / 4;
        const up = cyc < 0.45 ? Math.sin((cyc / 0.45) * Math.PI) : 0;
        tgt.armRX = -0.6 - up * 1.4;
        tgt.armRZ = -0.25 - up * 0.2;
        tgt.headX = -up * 0.25;
        tgt.bodyY = s(t * 2.2 + phase) * 0.006;
        break;
      }
      case 'eat': {
        // Quicker bites than a sip, with a small chew between them.
        const cyc = (t % 2.4) / 2.4;
        const up = cyc < 0.4 ? Math.sin((cyc / 0.4) * Math.PI) : 0;
        tgt.armRX = -0.7 - up * 1.3;
        tgt.armRZ = -0.25 - up * 0.2;
        tgt.headX = -up * 0.2 + (cyc > 0.4 ? Math.abs(s(t * 9)) * 0.03 : 0);
        tgt.bodyY = s(t * 2.2 + phase) * 0.006;
        break;
      }
      case 'peer':
        // Bent right over to look into something on the floor, hands on knees.
        tgt.bodyY = -0.09;
        tgt.lean = 0.62;
        tgt.headX = 0.35 + s(t * 1.3 + phase) * 0.05;
        tgt.headZ = s(t * 0.9) * 0.12;
        tgt.legL = -0.35; tgt.legR = -0.35;
        tgt.armLX = tgt.armRX = -0.55;
        tgt.armLZ = 0.18; tgt.armRZ = -0.18;
        break;
      case 'shoulder':
        // Something heavy resting on the right shoulder: the hand at the shoulder, the load behind.
        tgt.armRX = -1.8; tgt.armRZ = -0.45;
        tgt.headX = -0.05;
        tgt.bodyY = s(t * 2.2 + phase) * 0.006;
        break;
      case 'swing': {
        // Wind up overhead, then bring it down hard, once a second.
        const cyc = (t % 1.1) / 1.1;
        const down = cyc < 0.55 ? cyc / 0.55 : cyc < 0.7 ? 1 : 1 - (cyc - 0.7) / 0.3;
        const e = down * down;
        tgt.armRX = tgt.armLX = -3.0 + e * 2.3;
        tgt.armRZ = -0.1; tgt.armLZ = 0.1;
        tgt.lean = -0.12 + e * 0.4;
        tgt.bodyY = -e * 0.03;
        break;
      }
      case 'sigh': {
        // Seated, a long breath out: shoulders drop and the head sinks, then comes back up.
        const cyc = (t % 3.2) / 3.2;
        const b = Math.sin(Math.min(1, cyc / 0.6) * Math.PI);
        tgt.lean = 0.2 + b * 0.12;
        tgt.headX = 0.2 + b * 0.35;
        tgt.headZ = -0.25;
        tgt.armLX = tgt.armRX = TYPE_REACH - 0.2 - b * 0.15;
        tgt.armLZ = 0.2; tgt.armRZ = -0.2;
        tgt.bodyY -= b * 0.01;
        break;
      }
      case 'despair':
        // Standing, both arms flung up in a V, head back then down, rocking: bad news. Hands on the
        // head would hide behind the chibi head; a V shows from any angle.
        tgt.armLX = tgt.armRX = -0.3;
        tgt.armLZ = -2.3 - s(t * 2.2 + phase) * 0.2; tgt.armRZ = 2.3 + s(t * 2.2 + phase) * 0.2;
        tgt.headX = 0.3 + s(t * 1.6 + phase) * 0.1;
        tgt.headZ = s(t * 1.1 + phase) * 0.26;
        tgt.lean = 0.08;
        tgt.bodyY = s(t * 1.6 + phase) * 0.006;
        break;
      case 'readpaper':
        // Standing, a sheet held up at eye level in both hands, head tipped just a little to read it.
        tgt.armLX = tgt.armRX = -2.05;
        tgt.armLZ = -0.12; tgt.armRZ = 0.12;
        tgt.headX = 0.14 + s(t * 0.9 + phase) * 0.03;
        tgt.lean = 0.02;
        break;
      case 'slump':
        // Standing, deflated: shoulders forward, head hanging, arms dangling.
        // Head hangs only a little, so the camera still sees the face.
        tgt.lean = 0.18;
        tgt.headX = 0.18 + s(t * 1.2 + phase) * 0.05;
        tgt.headZ = 0.15;
        tgt.bodyY = -0.035;
        tgt.armLX = tgt.armRX = 0.25;
        tgt.armLZ = -0.05; tgt.armRZ = 0.05;
        break;
      case 'fanfrantic': {
        // Fanning fumes away in a hurry: both hands up in front, flapping fast and small, leaning back
        // with the head turned away. Speed is what separates it from a wave.
        const f = s(t * 26);
        // One hand flaps up by the face, the other out toward the fumes, so both show.
        tgt.armLX = -2.1 + f * 0.3; tgt.armRX = -1.4 - f * 0.25;
        tgt.armLZ = -0.75 + f * 0.25; tgt.armRZ = 0.5 + f * 0.3;
        tgt.lean = -0.22;
        tgt.headX = -0.18;
        tgt.headZ = 0.45;
        tgt.bodyY = Math.abs(s(t * 13)) * 0.012;
        break;
      }
      case 'fan':
        // Waving something away from the face with one hand, leaning back from it.
        // A big sweep out to the side and back, so it reads from any angle.
        tgt.armRX = -0.5;
        tgt.armRZ = 2.2 + s(t * 7) * 0.45;
        tgt.armLX = -0.6; tgt.armLZ = -0.4;
        tgt.lean = -0.1;
        tgt.headX = -0.1; tgt.headZ = 0.2;
        break;
      case 'recoil':
        // Seated, pushed back from the desk by what is on the screen: lean back, hands half up.
        tgt.bodyZ = -0.08;
        tgt.lean = -0.14;
        tgt.headX = -0.22;
        tgt.headZ = s(t * 3 + phase) * 0.08;
        tgt.armLX = tgt.armRX = -0.95;
        tgt.armLZ = 0.32; tgt.armRZ = -0.32;
        break;
      case 'carry': {
        const f = 7;
        tgt.legL = Math.sin(t * f) * 0.4;
        tgt.legR = -Math.sin(t * f) * 0.4;
        tgt.armLX = tgt.armRX = -1.05;
        tgt.armLZ = 0.35; tgt.armRZ = -0.35;
        tgt.bodyY = Math.abs(Math.sin(t * f)) * 0.02;
        tgt.lean = 0.06;
        break;
      }
      case 'lie': {
        // Flat on the back, centered on the spot; a slow breathing rise.
        tgt.pitch = -Math.PI / 2;
        tgt.bodyZ = 0.5;
        tgt.bodyY = 0.1 + s(t * 1.2 + phase) * 0.008;
        tgt.armLZ = 0.25; tgt.armRZ = -0.25;
        tgt.headZ = 0.25;
        break;
      }
      case 'tired': {
        // Exhausted but working: chin propped on one hand, the other hand typing slowly.
        const nod = Math.max(0, s(t * 0.9 + phase)) ** 8;
        tgt.bodyZ = -0.05;
        tgt.lean = 0.3;
        tgt.headX = 0.22 + nod * 0.25;
        tgt.headZ = 0.22;
        tgt.armRX = -2.0; tgt.armRZ = -0.55;
        tgt.armLX = TYPE_REACH - 0.3 - 0.12 - Math.abs(s(t * 6)) * 0.05; tgt.armLZ = 0.3;
        tgt.bodyY -= 0.02;
        break;
      }
      case 'desknap': {
        // A short nap on folded arms, gently breathing: sat back like burnout so the head rests on
        // the arms on the desk rather than in it.
        tgt.bodyZ = -0.12;
        tgt.lean = 0.55;
        tgt.headX = 0.42;
        tgt.headZ = 0.45;
        tgt.armLX = tgt.armRX = -2.6;
        tgt.armLZ = 0.6; tgt.armRZ = -0.6;
        tgt.bodyY -= 0.02 - s(t * 1.1 + phase) * 0.006;
        break;
      }
      case 'point':
        tgt.armRX = -1.85; tgt.armRZ = -0.12;
        tgt.lean = 0.06;
        tgt.headX = -0.05;
        break;
      case 'press':
        // Both hands up against the glass.
        tgt.armLX = tgt.armRX = -1.55;
        tgt.armLZ = 0.4; tgt.armRZ = -0.4;
        tgt.lean = 0.14;
        break;
      case 'whisper':
        tgt.lean = 0.12;
        tgt.headZ = 0.32;
        tgt.armRX = -1.25; tgt.armRZ = -0.7;
        break;
      case 'shake':
        tgt.headZ = s(t * 7) * 0.22;
        tgt.headX = 0.12;
        tgt.armLZ = 0.05; tgt.armRZ = -0.05;
        break;
      case 'nap':
        // Lying on the back, the upper body inclined so the head rests up on an armrest.
        tgt.pitch = -Math.PI / 2 + 0.3;
        tgt.bodyZ = 0.5;
        tgt.bodyY = 0.1 + s(t * 1.2 + phase) * 0.006;
        tgt.headX = 0.3;
        tgt.armLZ = 0.35; tgt.armRZ = -0.35;
        tgt.armLX = -0.3; tgt.armRX = -0.3;
        break;
      case 'sit':
        tgt.lean = -0.18;
        tgt.headZ = s(t * 0.5 + phase) * 0.08;
        tgt.armLX = tgt.armRX = -0.5;
        tgt.armLZ = 0.3; tgt.armRZ = -0.3;
        break;
      case 'sprawl':
        tgt.bodyY = 0.24 - HIP_Y;
        tgt.lean = -0.55;
        tgt.legL = -1.1; tgt.legR = -0.95;
        tgt.armLZ = 1.25; tgt.armRZ = -1.25;
        tgt.headX = -0.2 + s(t * 0.8 + phase) * 0.04;
        break;
      case 'play': {
        tgt.lean = 0.12;
        tgt.headX = 0.1;
        tgt.armLX = -1.15 + s(t * 17) * 0.1;
        tgt.armRX = -1.15 + s(t * 13 + 1) * 0.12;
        tgt.armLZ = 0.2; tgt.armRZ = -0.2;
        tgt.twist = s(t * 3 + phase) * 0.06;
        tgt.bodyY = Math.abs(s(t * 6)) * 0.01;
        break;
      }
      case 'playsit':
        tgt.lean = 0.1;
        tgt.headX = -0.05;
        tgt.armLX = -1.2 + s(t * 17) * 0.1;
        tgt.armRX = -1.2 + s(t * 13 + 1) * 0.12;
        tgt.armLZ = 0.2; tgt.armRZ = -0.2;
        tgt.twist = s(t * 3 + phase) * 0.05;
        break;
      case 'read':
        tgt.lean = -0.1;
        tgt.headX = 0.35 + s(t * 0.3 + phase) * 0.04;
        tgt.armLX = tgt.armRX = -0.95;
        tgt.armLZ = 0.35; tgt.armRZ = -0.35;
        break;
      case 'paddle': {
        const sw = s(t * 6.5 + phase);
        tgt.armRX = -0.9 + sw * 0.6;
        tgt.armRZ = -0.55 - sw * 0.25;
        tgt.armLX = -0.4;
        tgt.twist = sw * 0.28;
        tgt.lean = 0.1;
        tgt.bodyY = Math.abs(s(t * 6.5)) * 0.03;
        tgt.legL = s(t * 6.5) * 0.15; tgt.legR = -s(t * 6.5) * 0.15;
        break;
      }
      case 'browse': {
        const reach = Math.max(0, s(t * 0.7 + phase));
        tgt.armRX = -1.0 - reach * 1.1;
        tgt.armLX = -0.7;
        tgt.headX = 0.2 - reach * 0.45;
        tgt.headZ = s(t * 0.4) * 0.12;
        break;
      }
      case 'water':
        tgt.lean = 0.2;
        tgt.headX = 0.25;
        tgt.armRX = -1.25 + s(t * 2) * 0.12;
        tgt.armRZ = -0.15;
        break;
      case 'groan':
        tgt.lean = 0.28;
        tgt.headX = 0.3;
        tgt.headZ = s(t * 1.5) * 0.12;
        tgt.armLZ = 0.05; tgt.armRZ = -0.05;
        break;
      case 'dance_polka': case 'dance_robot': case 'dance_bossa': case 'dance_lofi': case 'dance_bob': case 'dance_stiff':
        tgt.bodyY = Math.abs(s(t * 6 + phase)) * 0.03;
        tgt.headX = Math.abs(s(t * 6 + phase)) * 0.08;
        tgt.armLZ = -0.3; tgt.armRZ = 0.3;
        break;
      case 'wave':
        tgt.armRZ = 2.5 + s(t * 10) * 0.35;
        tgt.headZ = -0.1;
        tgt.bodyY = s(t * 2.2 + phase) * 0.006;
        break;
      default:
        break;
    }
    if (mood === 'coasting' && !seated && anim === 'idle') { tgt.headX += 0.25; tgt.lean += 0.12; }
    if (tired && !seated && anim === 'idle') { tgt.headX += 0.3; tgt.lean += 0.15; tgt.bodyY -= 0.015; }
    const k = 1 - Math.exp(-dt * 16);
    for (const key in cur) cur[key] += (tgt[key] - cur[key]) * k;

    body.scale.set(1 / Math.sqrt(cur.squash), cur.squash, 1 / Math.sqrt(cur.squash));
    if (!rigPose(dt)) {
      body.position.set(0, cur.bodyY, cur.bodyZ);
      body.rotation.set(cur.pitch, 0, 0);
      torso.rotation.set(cur.lean, cur.twist, 0);
      headGroup.rotation.set(cur.headX, 0, cur.headZ);
      legs[0].rotation.set(cur.legL, 0, 0);
      legs[1].rotation.set(cur.legR, 0, 0);
      arms[0].shoulder.rotation.set(cur.armLX, 0, cur.armLZ);
      arms[1].shoulder.rotation.set(cur.armRX, 0, cur.armRZ);
    }
    blendIn(dt);
  }

  function setAnim(name) {
    if (!ANIMS.includes(name) || name === anim) return;
    anim = name;
    animT = 0;
    attach(mug, mugParent, name === 'sip' || name === 'water');
    attach(slice, mugParent, name === 'eat');
    if (held) attach(held, mugParent, true);
    // Lying people are lifted onto furniture with their root, and the floor ring would float with them.
    ring.visible = !LYING.has(name);
    attach(box, boxParent, name === 'carry');
  }

  function setEmote(kind) {
    if (kind === emoteKind) return;
    flushFor = WARM_EMOTES.has(kind) ? 2.2 : flushFor;
    emoteKind = kind;
    emoteT = 0;
    if (kind) emote.material = emoteMaterial(kind);
    emote.visible = !!kind;
    attach(emote, root, !!kind);
  }

  // Something carried in the right hand (moments.js: a sledgehammer), or null.
  let held = null;
  function setHeld(obj) {
    if (held === obj) return;
    if (held) held.removeFromParent();
    held = obj ?? null;
    if (held) attach(held, mugParent, true);
  }

  function setTint(g) {
    tint = Math.max(0, Math.min(1, g));
    bm.userData.tint.value = tint;
  }

  function setMood(m) {
    mood = m;
    const face = m === 'burnout' ? 'burnout' : m === 'coasting' ? 'coasting' : 'ok';
    faceMood = face;
    showFace();
    setTint(m === 'burnout' ? 0.7 : m === 'coasting' ? 0.4 : 0);
  }
  setMood('ok');

  // Low stamina: slower, slouched walk and a drooping idle (the seated pose is chosen by sync).
  function setTired(on) { tired = !!on; }

  function setLegend(on) {
    if (on && !halo) {
      haloMat ??= new THREE.MeshStandardMaterial({ color: color('gold'), emissive: color('gold'), emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.4 });
      halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.y = HEAD_TOP + 0.08;
      halo.castShadow = false;
      root.add(halo);
    }
    if (halo) halo.visible = !!on;
  }

  function update(dt) {
    t += dt;
    // Cheeks flush only as an expression (celebrating, a warm emote), fading in and out.
    flushFor = Math.max(0, flushFor - dt);
    const want = CHEEK_FLUSH && (anim === 'celebrate' || flushFor > 0) ? 1 : 0;
    flush += (want - flush) * (1 - Math.exp(-dt * 6));
    cheeks.set(flush);
    animT += dt;
    pose(dt);
    blinkIn -= dt;
    if (blinkIn <= 0) { blinkT = 0.12; blinkIn = 2.5 + rand() * 3.5; }
    const closed = blinkT > 0 || anim === 'burnout' || SLEEPING.has(anim) || (mood === 'burnout' && anim !== 'celebrate');
    if (blinkT > 0) blinkT -= dt;
    if (closed !== faceClosed) { faceClosed = closed; showFace(); }
    if (emote.visible) {
      emoteT += dt;
      const p = Math.min(1, emoteT / 0.2);
      const pop = p < 0.7 ? (p / 0.7) * 1.15 : 1.15 - ((p - 0.7) / 0.3) * 0.15;
      const s = 0.42 * pop;
      emote.scale.set(s, s, 1);
      emote.position.y = HEAD_TOP + 0.22 + Math.sin(t * 3) * 0.02 + cur.bodyY;
    }
    if (halo?.visible) {
      halo.rotation.y += dt * 1.2;
      halo.position.y = HEAD_TOP + 0.1 + cur.bodyY + Math.sin(t * 2) * 0.015;
    }
  }

  // While the game is paused everything holds its pose; only a faint breath shows it is alive.
  let breathT = rand() * 6;
  function breathe(dt) {
    breathT += dt;
    // A playing clip holds its own frame; the offset below is for procedural poses.
    if (rigClip) return;
    body.position.y = cur.bodyY + Math.sin(breathT * 1.8 + phase) * 0.004;
  }

  // Low quality drops character shadows (a pass per person) to save draw calls.
  function setShadows(on) { for (const b of baked) if (b) b.castShadow = on && b.userData.cast; }

  function dispose() {
    if (mixer) { mixer.stopAllAction(); mixer.uncacheRoot(proxy); }
    for (const m of Object.values(own)) m.dispose();
    for (const b of baked) if (b && !b.geometry.userData.shared) b.geometry.dispose();
    bm.dispose();
    cheeks.dispose();
    pickProxy.material.dispose();
    root.removeFromParent();
  }

  function setRingScale(s) {
    if (ring.scale.x === s) return;
    ring.scale.set(s, 1, s);
    ring.updateMatrix();
  }
  // Walking speed in m/s, for the walk clip's playback rate.
  function setMoveSpeed(v) { moveSpeed = v; }
  // Playback rate for clips other than the walk (a dance at the music's tempo).
  let animRate = 1;
  function setAnimRate(k) { animRate = k; }

  // Parts that never move relative to their pivot keep their local matrix instead of recomposing
  // it every frame (the ring recomposes itself when its scale changes).
  for (const o of [...baked, ring, pickProxy, headGroup.parent]) {
    if (!o) continue;
    o.updateMatrix();
    o.matrixAutoUpdate = false;
  }
  update(0);
  return {
    root, head: headGroup, setShadows, setAnim, setHeld, setMoveSpeed, setAnimRate, update, breathe, setEmote, setTint, setMood, setLegend, setTired, setRingScale, dispose, pickProxy,
    get anim() { return anim; },
    // Staging measurements (probe.js), in world space: the eyes, the way the face points, the hands.
    probe() {
      root.updateMatrixWorld(true);
      const q = headGroup.getWorldQuaternion(new THREE.Quaternion());
      const hand = (a) => a.shoulder.localToWorld(a.wrist.position.clone().add(HAND_TIP));
      return {
        eyes: headGroup.localToWorld(eyeLocal.clone()),
        forward: new THREE.Vector3(0, 0, 1).applyQuaternion(q),
        head: headGroup.getWorldPosition(new THREE.Vector3()),
        hands: [hand(arms[0]), hand(arms[1])],
        anim,
      };
    },
    get emote() { return emoteKind; },
    get mood() { return mood; },
    get seated() { return SEATED.has(anim); },
  };
}

export { ANIMS };
