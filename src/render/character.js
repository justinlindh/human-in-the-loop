import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { getTemplate } from './models.js';
import { mat, color, paletteMaterial } from './materials.js';
import { SKINS, ROLE_COLORS, PALETTE } from './palette.js';
import { emoteMaterial } from './emotes.js';

// Chibi assembly from the named parts in chibi.glb, animated with plain transforms.
// Pivots: neck (head parts), waist (torso parts), shoulder (arm), wrist (hand), hip (leg), ankle (shoe).

const LEG_L = 0.25;
const SHOE_H = 0.06;
const HIP_Y = LEG_L + SHOE_H;
const TORSO_H = 0.30;
const BUILD_W = [0.26, 0.3, 0.36];
const SEAT_HIP_Y = 0.47;
const HEAD_TOP = HIP_Y + TORSO_H + 0.43;

const ANIMS = ['idle', 'typing', 'walk', 'run', 'slumped', 'burnout', 'celebrate', 'sip', 'wave', 'carry',
  'lie', 'sit', 'sprawl', 'play', 'paddle', 'browse', 'water', 'groan'];
const SEATED = new Set(['typing', 'slumped', 'burnout', 'sit', 'sprawl']);

const ink = new THREE.Color(PALETTE.ink);
const inkL = ink.r * 0.2126 + ink.g * 0.7152 + ink.b * 0.0722;

// Appearance colors come from sim data: keep them off pure black and slightly muted so the
// palette's saturated accents stay special.
function characterColor(hex, mute = 0.15) {
  const c = new THREE.Color(hex);
  const l = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
  if (l < inkL) c.lerp(ink, 1 - l / Math.max(inkL, 1e-4));
  const gray = new THREE.Color(l, l, l);
  return c.lerp(gray, mute);
}

// A shirt close to the role color would swallow the role garment; push it toward pale cream.
function shirtColor(hex, roleHex) {
  const c = characterColor(hex);
  const r = new THREE.Color(roleHex);
  const d = Math.hypot(c.r - r.r, c.g - r.g, c.b - r.b);
  return d < 0.35 ? c.lerp(new THREE.Color(PALETTE.paper), 0.6) : c;
}

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
const boxGeo = new RoundedBoxGeometry(0.34, 0.24, 0.26, 2, 0.025);
const pickGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.15, 8).translate(0, 0.58, 0);
let haloMat = null;
const haloGeo = new THREE.TorusGeometry(0.14, 0.022, 8, 28).rotateX(Math.PI / 2);

// Parts are modeled in their pivot's space, so the node transform from the file is kept as is.
function part(tpl, name) {
  const o = tpl.getObjectByName(name);
  return o ? o.clone(true) : new THREE.Group();
}

export function createCharacter(appearance = {}, roleColor = PALETTE.role_engineer, opts = {}) {
  const tpl = getTemplate('chibi');
  const role = opts.role ?? null;
  const build = Math.max(0, Math.min(2, appearance.build ?? 1));
  const acc = appearance.accessory ?? 'none';
  const hairIdx = Math.max(0, Math.min(7, appearance.hair ?? 0));
  const hat = acc === 'beanie' || acc === 'cap';

  // Per-character materials (tintable); everything else is shared.
  const own = {
    skin: new THREE.MeshStandardMaterial({ color: new THREE.Color(SKINS[appearance.skin ?? 1] ?? SKINS[1]), roughness: 0.75 }),
    hair: new THREE.MeshStandardMaterial({ color: characterColor(appearance.hairColor ?? '#4a3222', 0.05), roughness: 0.6 }),
    shirt: new THREE.MeshStandardMaterial({ color: shirtColor(appearance.shirt ?? '#4f8cff', roleColor), roughness: 0.85 }),
    pants: new THREE.MeshStandardMaterial({ color: characterColor(appearance.pants ?? '#2e3440', 0.1), roughness: 0.85 }),
  };
  const base = Object.fromEntries(Object.entries(own).map(([k, m]) => [k, m.color.clone()]));
  const roleMat = roleMaterial(role, roleColor);

  // Only the big shapes cast shadows, and people skip the AO pass (their floor ring grounds them);
  // that keeps a full office's extra passes to a few draw calls per person.
  function skinMats(o, cast = false) {
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
      m.userData.noAO = true;
    });
    return o;
  }
  const CASTERS = /^(head|hair_|torso_|leg|acc_beanie|acc_cap)/;
  const P = (name) => (tpl ? skinMats(part(tpl, name), CASTERS.test(name)) : new THREE.Group());

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
  if (role && role !== 'support') {
    const g = P(`role_${role}`);
    g.scale.set(wScale, 1, bdepth);
    torso.add(g);
  }

  const neck = new THREE.Group();
  neck.position.y = TORSO_H - 0.01;
  torso.add(neck);
  const headGroup = new THREE.Group();
  neck.add(headGroup);
  headGroup.add(P('head'));
  const eyes = P('eyes');
  const shine = P('eye_shine');
  const blush = P('blush');
  const mouths = { ok: P('mouth_smile'), coasting: P('mouth_flat'), burnout: P('mouth_frown') };
  headGroup.add(eyes, shine, blush, mouths.ok, mouths.coasting, mouths.burnout);
  // A hat replaces the hair; drawing both makes them fight through each other.
  if (!hat) headGroup.add(P(`hair_${hairIdx}`));
  if (acc !== 'none') headGroup.add(P(`acc_${acc}`));
  if (role === 'support') headGroup.add(P('role_support'));

  const arms = [-1, 1].map((sx) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(sx * (BUILD_W[build] / 2 + 0.03), TORSO_H - 0.06, 0);
    const arm = P('arm');
    const wrist = new THREE.Group();
    wrist.position.y = -0.2;
    wrist.add(P('hand'));
    shoulder.add(arm, wrist);
    torso.add(shoulder);
    return { shoulder, wrist };
  });
  const mug = P('mug');
  mug.position.set(0, -0.06, 0.04);
  mug.visible = false;
  arms[1].wrist.add(mug);

  const box = new THREE.Mesh(boxGeo, mat('cardboard'));
  box.position.set(0, TORSO_H * 0.35, 0.24);
  box.castShadow = true;
  box.visible = false;
  torso.add(box);

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
  root.add(emote);

  let halo = null;

  // Animation state
  let anim = 'idle';
  let t = Math.random() * 10;
  let animT = 0;
  let blinkIn = 2 + Math.random() * 3;
  let blinkT = 0;
  let emoteKind = null;
  let emoteT = 0;
  let tint = 0;
  let mood = 'ok';
  const cur = { bodyY: 0, bodyZ: 0, pitch: 0, lean: 0, headX: 0, headZ: 0, legL: 0, legR: 0, armLX: 0, armLZ: 0.1, armRX: 0, armRZ: -0.1, squash: 1, twist: 0 };
  const tgt = { ...cur };
  const phase = Math.random() * Math.PI * 2;

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
        tgt.lean = 0.12;
        tgt.headX = 0.12 + s(t * 1.3 + phase) * 0.04;
        tgt.armLX = tgt.armRX = -1.15;
        tgt.armLZ = 0.28; tgt.armRZ = -0.28;
        tgt.armLX += s(t * 22) * 0.08;
        tgt.armRX += s(t * 22 + 2) * 0.08;
        tgt.bodyY += Math.abs(s(t * 11)) * 0.004;
        break;
      }
      case 'slumped':
        tgt.lean = 0.42;
        tgt.headX = 0.5 + s(t * 0.6 + phase) * 0.05;
        tgt.headZ = 0.12;
        tgt.armLX = tgt.armRX = -0.95;
        tgt.armLZ = 0.22; tgt.armRZ = -0.22;
        tgt.armLX += s(t * 5) * 0.05;
        tgt.bodyY -= 0.03;
        break;
      case 'burnout': {
        const sigh = Math.max(0, s(t * 1.4 + phase)) ** 6;
        tgt.lean = 0.95 - sigh * 0.25;
        tgt.headX = 0.55;
        tgt.headZ = 0.35;
        tgt.armLX = tgt.armRX = -1.7;
        tgt.armLZ = 0.55; tgt.armRZ = -0.55;
        tgt.bodyY -= 0.05 - sigh * 0.03;
        break;
      }
      case 'walk':
      case 'run': {
        const run = anim === 'run';
        const f = run ? 13 : 8;
        const a = run ? 0.75 : 0.45;
        tgt.legL = s(t * f) * a;
        tgt.legR = -s(t * f) * a;
        tgt.armLX = -s(t * f) * a * 0.9;
        tgt.armRX = s(t * f) * a * 0.9;
        tgt.bodyY = Math.abs(s(t * f)) * (run ? 0.05 : 0.025);
        tgt.lean = run ? 0.22 : 0.04;
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
        tgt.headX = 0.5;
        tgt.headZ = s(t * 1.5) * 0.12;
        tgt.armLZ = 0.05; tgt.armRZ = -0.05;
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
    const k = 1 - Math.exp(-dt * 16);
    for (const key in cur) cur[key] += (tgt[key] - cur[key]) * k;

    body.position.set(0, cur.bodyY, cur.bodyZ);
    body.rotation.x = cur.pitch;
    body.scale.set(1 / Math.sqrt(cur.squash), cur.squash, 1 / Math.sqrt(cur.squash));
    torso.rotation.set(cur.lean, cur.twist, 0);
    headGroup.rotation.set(cur.headX, 0, cur.headZ);
    legs[0].rotation.x = cur.legL;
    legs[1].rotation.x = cur.legR;
    arms[0].shoulder.rotation.set(cur.armLX, 0, cur.armLZ);
    arms[1].shoulder.rotation.set(cur.armRX, 0, cur.armRZ);
  }

  function setAnim(name) {
    if (!ANIMS.includes(name) || name === anim) return;
    anim = name;
    animT = 0;
    mug.visible = name === 'sip' || name === 'water';
    box.visible = name === 'carry';
  }

  function setEmote(kind) {
    if (kind === emoteKind) return;
    emoteKind = kind;
    emoteT = 0;
    if (kind) emote.material = emoteMaterial(kind);
    emote.visible = !!kind;
  }

  function setTint(g) {
    tint = Math.max(0, Math.min(1, g));
    for (const [k, m] of Object.entries(own)) {
      const c = base[k];
      const l = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
      m.color.setRGB(l, l, l).multiplyScalar(0.92).lerp(c, 1 - tint);
    }
  }

  function setMood(m) {
    mood = m;
    for (const [k, o] of Object.entries(mouths)) o.visible = k === (m === 'burnout' ? 'burnout' : m === 'coasting' ? 'coasting' : 'ok');
    blush.visible = m === 'ok';
    setTint(m === 'burnout' ? 0.7 : m === 'coasting' ? 0.4 : 0);
  }
  setMood('ok');

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
    animT += dt;
    pose(dt);
    blinkIn -= dt;
    if (blinkIn <= 0) { blinkT = 0.12; blinkIn = 2.5 + Math.random() * 3.5; }
    const closed = blinkT > 0 || anim === 'burnout' || (mood === 'burnout' && anim !== 'celebrate');
    if (blinkT > 0) blinkT -= dt;
    eyes.scale.y = closed ? 0.15 : 1;
    shine.visible = !closed;
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

  function dispose() {
    for (const m of Object.values(own)) m.dispose();
    pickProxy.material.dispose();
    root.removeFromParent();
  }

  function setRingScale(s) { ring.scale.set(s, 1, s); }

  update(0);
  return {
    root, setAnim, update, setEmote, setTint, setMood, setLegend, setRingScale, dispose, pickProxy,
    get anim() { return anim; },
    get emote() { return emoteKind; },
    get mood() { return mood; },
    get seated() { return SEATED.has(anim); },
  };
}

export { ANIMS };
