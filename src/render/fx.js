import * as THREE from 'three';
import { PALETTE as P } from './palette.js';

const MAX_CONFETTI = 6;
const PIECES = 70;
const CONFETTI_COLORS = [P.role_engineer, P.role_designer, P.role_marketer, P.role_support, P.role_sales, P.gold, P.paper, P.screen_cyan];
const GRAVITY = -5.5;

// Effects that are not tied to one character: confetti, the incident alarm, item pop-ins.
export function createFx({ scene, overlayEl }) {
  const group = new THREE.Group();
  group.name = 'fx';
  scene.add(group);

  // Confetti: pooled instanced quads, oldest system recycled when all are busy.
  const pieceGeo = new THREE.PlaneGeometry(0.07, 0.11);
  const pieceMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
  const systems = [];
  const dummy = new THREE.Object3D();
  const colors = CONFETTI_COLORS.map((c) => new THREE.Color(c));

  function makeSystem() {
    const mesh = new THREE.InstancedMesh(pieceGeo, pieceMat, PIECES);
    mesh.frustumCulled = false;
    mesh.userData.noAO = true;
    mesh.visible = false;
    for (let i = 0; i < PIECES; i++) mesh.setColorAt(i, colors[i % colors.length]);
    group.add(mesh);
    return { mesh, t: 0, life: 0, p: new Float32Array(PIECES * 3), v: new Float32Array(PIECES * 3), r: new Float32Array(PIECES * 3), active: false };
  }

  function confetti(x, y, z, { spread = 1, power = 1 } = {}) {
    let s = systems.find((q) => !q.active);
    if (!s && systems.length < MAX_CONFETTI) { s = makeSystem(); systems.push(s); }
    if (!s) s = systems.reduce((a, b) => (a.t > b.t ? a : b));
    s.active = true; s.t = 0; s.life = 2.6;
    s.mesh.visible = true;
    for (let i = 0; i < PIECES; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.25 * spread;
      s.p[i * 3] = x + Math.cos(a) * r; s.p[i * 3 + 1] = y; s.p[i * 3 + 2] = z + Math.sin(a) * r;
      const up = (3.2 + Math.random() * 2.2) * power;
      const out = (0.6 + Math.random() * 1.6) * spread;
      s.v[i * 3] = Math.cos(a) * out; s.v[i * 3 + 1] = up; s.v[i * 3 + 2] = Math.sin(a) * out;
      s.r[i * 3] = Math.random() * 6; s.r[i * 3 + 1] = Math.random() * 6; s.r[i * 3 + 2] = 4 + Math.random() * 8;
    }
    if (s.mesh.instanceColor) s.mesh.instanceColor.needsUpdate = true;
  }

  function updateConfetti(dt) {
    for (const s of systems) {
      if (!s.active) continue;
      s.t += dt;
      const k = s.t / s.life;
      if (k >= 1) { s.active = false; s.mesh.visible = false; continue; }
      for (let i = 0; i < PIECES; i++) {
        const j = i * 3;
        s.v[j + 1] += GRAVITY * dt;
        // Flutter: once falling, drag pulls toward a slow drift.
        if (s.v[j + 1] < 0) { s.v[j + 1] *= 1 - dt * 2.2; s.v[j] *= 1 - dt * 1.2; s.v[j + 2] *= 1 - dt * 1.2; }
        s.p[j] += s.v[j] * dt; s.p[j + 1] += s.v[j + 1] * dt; s.p[j + 2] += s.v[j + 2] * dt;
        if (s.p[j + 1] < 0.02) { s.p[j + 1] = 0.02; s.v[j] = s.v[j + 1] = s.v[j + 2] = 0; }
        dummy.position.set(s.p[j], s.p[j + 1], s.p[j + 2]);
        dummy.rotation.set(s.r[j] + s.t * s.r[j + 2], s.r[j + 1] + s.t * 3, 0);
        const sc = k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2;
        dummy.scale.setScalar(Math.max(0.001, sc));
        dummy.updateMatrix();
        s.mesh.setMatrixAt(i, dummy.matrix);
      }
      s.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // Alarm: a red spotlight sweeping the floor plus a red edge pulse over the scene.
  const spot = new THREE.SpotLight(new THREE.Color(P.alarm_red), 0, 30, Math.PI / 7, 0.5, 1.2);
  spot.position.set(0, 7, 0);
  scene.add(spot, spot.target);
  let alarmT = 0;
  let alarmDur = 0;
  let alarmCenter = new THREE.Vector3();
  let alarmR = 3;
  const vignette = document.createElement('div');
  vignette.style.cssText = `position:absolute;inset:0;pointer-events:none;opacity:0;
    background:radial-gradient(ellipse at center, rgba(0,0,0,0) 68%, ${P.alarm_red}70 100%);`;
  overlayEl?.appendChild(vignette);

  function alarm(center, radius = 3, seconds = 3.2) {
    alarmCenter.copy(center);
    alarmR = radius;
    alarmT = 0;
    alarmDur = seconds;
  }

  function updateAlarm(dt) {
    if (alarmT >= alarmDur) { spot.intensity = 0; vignette.style.opacity = '0'; return; }
    alarmT += dt;
    const env = Math.min(1, alarmT / 0.2) * Math.min(1, (alarmDur - alarmT) / 0.5);
    const a = alarmT * 4.5;
    spot.position.set(alarmCenter.x, 6.5, alarmCenter.z);
    spot.target.position.set(alarmCenter.x + Math.cos(a) * alarmR, 0, alarmCenter.z + Math.sin(a) * alarmR);
    spot.intensity = 90 * env;
    vignette.style.opacity = String((0.3 + 0.25 * Math.sin(alarmT * 9)) * env);
  }

  // Item pop-in: squash and stretch the new model and throw a small gold burst.
  const pops = [];
  function pop(obj) {
    obj.scale.setScalar(0.001);
    pops.push({ obj, t: 0 });
    const p = obj.getWorldPosition(new THREE.Vector3());
    confetti(p.x, 0.6, p.z, { spread: 0.6, power: 0.55 });
  }
  function updatePops(dt) {
    for (let i = pops.length - 1; i >= 0; i--) {
      const q = pops[i];
      q.t += dt;
      const p = Math.min(1, q.t / 0.3);
      const s = p < 0.65 ? (p / 0.65) * 1.15 : 1.15 - ((p - 0.65) / 0.35) * 0.15;
      q.obj.scale.set(s, s * (p < 0.4 ? 1.12 : 1), s);
      if (p >= 1) { q.obj.scale.setScalar(1); pops.splice(i, 1); }
    }
  }

  function update(dt) {
    updateConfetti(dt);
    updateAlarm(dt);
    updatePops(dt);
  }

  return {
    group, confetti, alarm, pop, update,
    get liveConfetti() { return systems.filter((s) => s.active).length; },
  };
}
