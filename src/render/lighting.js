import * as THREE from 'three';
import { PALETTE } from './palette.js';

const C = (k) => new THREE.Color(PALETTE[k]);
const INTERIOR_COUNT = 6;

// Key sun with soft shadows, hemisphere fill, and a fixed pool of warm interior lights
// (fixed count so materials never recompile when lamps turn on).
export function createLighting(scene, { shadowSize = 2048 } = {}) {
  const env = { daylight: 1, night: 0, dusk: 0, listeners: new Set() };

  const hemi = new THREE.HemisphereLight(C('hemi_sky_day'), C('hemi_ground_day'), 1.2);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(C('sun_day'), 3.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 6;
  scene.add(sun, sun.target);

  const interior = [];
  for (let i = 0; i < INTERIOR_COUNT; i++) {
    const l = new THREE.PointLight(C('lamp_warm'), 0, 11, 1.25);
    l.position.set(0, -50, 0);
    scene.add(l);
    interior.push(l);
  }
  let interiorSpots = [];

  const center = new THREE.Vector3();
  const size = new THREE.Vector3(10, 3, 10);

  function fitShadow(box) {
    box.getCenter(center);
    box.getSize(size);
    const r = Math.hypot(size.x, size.z) * 0.5 + 1.5;
    const cam = sun.shadow.camera;
    cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r;
    cam.near = 0.5; cam.far = 80;
    cam.updateProjectionMatrix();
  }

  function setInteriorLights(points) {
    interiorSpots = points.slice(0, INTERIOR_COUNT);
    interior.forEach((l, i) => {
      const p = interiorSpots[i];
      if (p) l.position.set(p.x, p.y ?? 2.4, p.z);
      else l.position.set(0, -50, 0);
    });
    setTimeOfDay(lastT);
  }

  const skyDay = C('hemi_sky_day'), skyNight = C('hemi_sky_night');
  const gDay = C('hemi_ground_day'), gNight = C('hemi_ground_night');
  const sunDay = C('sun_day'), sunDusk = C('sun_dusk'), moon = C('moon');
  const tmpC = new THREE.Color();

  let viewYaw = Math.PI / 4;
  let lastT = 0.45;

  // The key follows camera rotation so it always comes from the viewer's upper left.
  function setViewYaw(y) {
    if (Math.abs(y - viewYaw) < 1e-4) return;
    viewYaw = y;
    setTimeOfDay(lastT);
  }

  // t: 0 midnight, 0.5 noon.
  function setTimeOfDay(t) {
    lastT = t;
    const elev = Math.sin((t - 0.25) * Math.PI * 2);
    const daylight = THREE.MathUtils.smoothstep(elev, -0.12, 0.3);
    const dusk = Math.max(0, 1 - Math.abs(elev - 0.05) / 0.3) * (daylight > 0.02 ? 1 : 0);
    env.daylight = daylight;
    env.night = 1 - daylight;
    env.dusk = dusk;

    hemi.color.copy(skyNight).lerp(skyDay, daylight);
    hemi.groundColor.copy(gNight).lerp(gDay, daylight);
    hemi.intensity = THREE.MathUtils.lerp(0.55, 0.85, daylight);

    tmpC.copy(sunDay).lerp(sunDusk, dusk * 0.8);
    sun.color.copy(moon).lerp(tmpC, daylight);
    sun.intensity = THREE.MathUtils.lerp(0.55, 3.4, daylight);

    // Sun swings a little across the day; the key stays upper left of the view for readability.
    const az = viewYaw - Math.PI / 4 + THREE.MathUtils.degToRad(THREE.MathUtils.lerp(12, 34, THREE.MathUtils.clamp(t * 2 - 0.5, 0, 1)));
    const el = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(35, 58, daylight));
    const d = 30;
    sun.position.set(center.x + Math.sin(az) * Math.cos(el) * d, center.y + Math.sin(el) * d, center.z + Math.cos(az) * Math.cos(el) * d);
    sun.target.position.copy(center);

    const lamp = THREE.MathUtils.lerp(0, 7.5, THREE.MathUtils.smoothstep(env.night, 0.2, 0.9));
    interior.forEach((l, i) => { l.intensity = interiorSpots[i] ? lamp * (interiorSpots[i].power ?? 1) : 0; });

    baseHemi.copy(hemi.color);
    baseGround.copy(hemi.groundColor);
    baseSun = sun.intensity;
    applyAlarm();
    for (const fn of env.listeners) fn(env);
  }

  // Incident alarm: pulls the fill toward red and dims the sun so it reads even in daylight.
  const baseHemi = new THREE.Color(), baseGround = new THREE.Color();
  const alarmRed = C('alarm_red');
  let baseSun = 3.4;
  let alarmK = 0;
  function applyAlarm() {
    hemi.color.copy(baseHemi).lerp(alarmRed, 0.55 * alarmK);
    hemi.groundColor.copy(baseGround).lerp(alarmRed, 0.35 * alarmK);
    sun.intensity = baseSun * (1 - 0.45 * alarmK);
  }
  function setAlarm(k) {
    if (Math.abs(k - alarmK) < 0.005 && k !== 0) return;
    alarmK = k;
    applyAlarm();
  }

  function setShadowSize(n) {
    if (sun.shadow.mapSize.x === n) return;
    sun.shadow.mapSize.set(n, n);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }

  return { env, hemi, sun, interior, fitShadow, setInteriorLights, setTimeOfDay, setViewYaw, setShadowSize, setAlarm };
}

export function createBackdrop() {
  // Vertical gradient plus a soft vignette, drawn to a small canvas used as scene.background.
  // Redrawn only when the quantized sky colors change.
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const dT = C('sky_day_top'), dB = C('sky_day_bottom');
  const kT = C('sky_dusk_top'), kB = C('sky_dusk_bottom');
  const nT = C('sky_night_top'), nB = C('sky_night_bottom');
  const top = new THREE.Color(), bottom = new THREE.Color();
  let lastKey = '';
  let lastDraw = -1e9;

  // Redrawn at most a few times per second.
  function update(env) {
    const now = performance.now();
    if (now - lastDraw < 250 && lastKey) return;
    top.copy(nT).lerp(dT, env.daylight).lerp(kT, env.dusk * 0.6);
    bottom.copy(nB).lerp(dB, env.daylight).lerp(kB, env.dusk * 0.6);
    const key = top.getHexString() + bottom.getHexString();
    if (key === lastKey) return;
    lastKey = key;
    lastDraw = now;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, `#${top.getHexString(THREE.SRGBColorSpace)}`);
    g.addColorStop(1, `#${bottom.getHexString(THREE.SRGBColorSpace)}`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const v = ctx.createRadialGradient(128, 118, 40, 128, 128, 190);
    v.addColorStop(0, 'rgba(255,248,235,0.10)');
    v.addColorStop(1, 'rgba(42,38,48,0.16)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 256, 256);
    texture.needsUpdate = true;
  }
  return { texture, update };
}

// Windows glow pale sky by day and deep blue by night.
export function windowUpdater(materials) {
  const day = C('window_day'), night = C('window_night');
  return (env) => {
    for (const m of materials) {
      m.color.copy(night).lerp(day, env.daylight);
      m.emissive.copy(m.color);
      m.emissiveIntensity = THREE.MathUtils.lerp(0.35, 0.45, env.daylight);
    }
  };
}
