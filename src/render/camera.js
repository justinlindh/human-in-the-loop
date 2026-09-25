import * as THREE from 'three';

// Orthographic isometric camera: yaw 45 degrees plus 90 degree steps, pitch atan(1/sqrt(2)).
const PITCH = Math.atan(1 / Math.SQRT2);
const DISTANCE = 60;
const ZOOM_MIN = 0.7;
const ZOOM_MAX = 3.2;
// Screen space the HUD covers, in CSS px; the office is fitted into what is left.
const INSET = { top: 90, bottom: 100, left: 120, right: 150 };
const PAN_KEYS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

export function createCameraRig(canvas) {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const target = new THREE.Vector3(0, 0, 0);
  const goal = new THREE.Vector3(0, 0, 0);
  const bounds = new THREE.Box3(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 3, 5));
  const shakeOffset = new THREE.Vector3();
  let yaw = Math.PI / 4;
  let yawGoal = yaw;
  let zoom = 1;
  let zoomGoal = 1;
  let fitHeight = 12;
  let fitShown = 12;       // fitHeight as drawn: eases toward it after an eased setBounds
  let aspect = 1;
  let viewW = 1, viewH = 1;
  let shakeTime = 0;
  let shakeDur = 0;
  let shakeAmp = 0;
  const keys = new Set();

  const tmp = new THREE.Vector3();
  const dirV = new THREE.Vector3();
  const rightV = new THREE.Vector3();
  const upV = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const center = new THREE.Vector3();
  const WORLD_UP = new THREE.Vector3(0, 1, 0);

  function viewDir(y, out = dirV) {
    return out.set(Math.sin(y) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(y) * Math.cos(PITCH));
  }

  function insets() {
    // Small windows shrink the reserved bands proportionally.
    const k = Math.min(1, viewH / 1080);
    return { top: INSET.top * k, bottom: INSET.bottom * k, left: INSET.left * k, right: INSET.right * k };
  }

  // Fit the bounds box into the HUD-free part of the view at the goal yaw.
  function refit() {
    const dir = viewDir(yawGoal);
    rightV.crossVectors(WORLD_UP, dir).normalize();
    upV.crossVectors(dir, rightV).normalize();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    bounds.getCenter(center);
    for (let i = 0; i < 8; i++) {
      tmp.set(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z).sub(center);
      const x = tmp.dot(rightV), y = tmp.dot(upV);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const ins = insets();
    const innerH = Math.max(80, viewH - ins.top - ins.bottom);
    const innerW = Math.max(80, viewW - ins.left - ins.right);
    const needH = (maxY - minY) * 1.04;
    const needW = (maxX - minX) * 1.04;
    fitHeight = Math.max(needH * viewH / innerH, needW * viewH / innerW);
  }

  // ease: glide the view to the new framing (an office move) instead of cutting to it.
  function setBounds(box, recenter = true, ease = false) {
    bounds.copy(box);
    refit();
    if (!ease) fitShown = fitHeight;
    if (recenter) {
      box.getCenter(center);
      goal.copy(center);
      if (!ease) target.copy(goal);
    }
  }

  function resize(w, h) {
    viewW = Math.max(1, w); viewH = Math.max(1, h);
    aspect = viewW / viewH;
    refit();
    fitShown = fitHeight;
  }

  function clampGoal() {
    const pad = 1.5;
    goal.x = THREE.MathUtils.clamp(goal.x, bounds.min.x - pad, bounds.max.x + pad);
    goal.z = THREE.MathUtils.clamp(goal.z, bounds.min.z - pad, bounds.max.z + pad);
  }

  function worldPerPx() {
    return fitHeight / zoom / viewH;
  }

  function panScreen(dxPx, dyPx) {
    const wpp = worldPerPx();
    const dir = viewDir(yaw);
    rightV.set(Math.cos(yaw), 0, -Math.sin(yaw));
    fwd.set(-dir.x, 0, -dir.z).normalize();
    // Screen up maps to ground forward scaled by 1/sin(pitch) because the ground is foreshortened.
    goal.addScaledVector(rightV, -dxPx * wpp);
    goal.addScaledVector(fwd, (dyPx * wpp) / Math.sin(PITCH));
    clampGoal();
  }

  // Input
  let dragging = false;
  let lastX = 0, lastY = 0;
  // When the player last touched the camera (scripted eases stay out of their way), and how fast
  // the view follows its goal (scripted eases use a slower rate; player input restores the default).
  let lastInput = -1e9;
  let followRate = 10;
  const touched = () => { lastInput = performance.now(); followRate = 10; };
  const onDown = (e) => {
    touched();
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    // Capture can fail (a pointer that already ended); a drag works without it.
    try { canvas.setPointerCapture?.(e.pointerId); } catch { /* not capturable */ }
  };
  const onMove = (e) => {
    if (!dragging) return;
    panScreen(e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX; lastY = e.clientY;
  };
  const onUp = (e) => { dragging = false; if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId); };
  const onWheel = (e) => {
    e.preventDefault();
    touched();
    zoomGoal = THREE.MathUtils.clamp(zoomGoal * Math.exp(-e.deltaY * 0.0015), ZOOM_MIN, ZOOM_MAX);
  };
  const ignore = (e) => {
    const t = e.target;
    return e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey
      || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable));
  };
  const onKeyDown = (e) => {
    if (ignore(e)) return;
    const k = e.key.toLowerCase();
    if (k === 'q' || k === 'e' || PAN_KEYS.has(k)) touched();
    if (k === 'q' || k === 'e') {
      yawGoal += (k === 'q' ? -1 : 1) * Math.PI / 2;
      refit();
    } else if (PAN_KEYS.has(k)) keys.add(k);
  };
  const onKeyUp = (e) => keys.delete(e.key.toLowerCase());
  const onBlur = () => keys.clear();
  const onContext = (e) => e.preventDefault();

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContext);
  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);
  addEventListener('blur', onBlur);

  function shake(amp = 0.25, dur = 0.4) {
    shakeAmp = amp; shakeDur = dur; shakeTime = dur;
  }

  function focus(point, zoomTo = null, rate = 10) {
    followRate = rate;
    goal.set(point.x, point.y ?? center.y, point.z);
    clampGoal();
    if (zoomTo) zoomGoal = THREE.MathUtils.clamp(zoomTo, ZOOM_MIN, ZOOM_MAX);
  }

  function update(dt) {
    const speed = 900 * dt;
    let kx = 0, ky = 0;
    if (keys.has('arrowleft')) kx += speed;
    if (keys.has('arrowright')) kx -= speed;
    if (keys.has('arrowup')) ky += speed;
    if (keys.has('arrowdown')) ky -= speed;
    if (kx || ky) panScreen(kx, ky);

    const k = 1 - Math.exp(-dt * followRate);
    target.lerp(goal, k);
    yaw += (yawGoal - yaw) * (1 - Math.exp(-dt * 8));
    zoom += (zoomGoal - zoom) * k;
    fitShown += (fitHeight - fitShown) * (1 - Math.exp(-dt * 4));

    shakeOffset.set(0, 0, 0);
    if (shakeTime > 0) {
      shakeTime = Math.max(0, shakeTime - dt);
      const a = shakeAmp * (shakeTime / shakeDur);
      const t = performance.now() * 0.05;
      shakeOffset.set(Math.sin(t * 1.7) * a, Math.sin(t * 2.3) * a * 0.5, Math.cos(t * 1.9) * a);
    }

    // Shift the view so the target lands in the center of the HUD-free area.
    const dir = viewDir(yaw);
    rightV.crossVectors(WORLD_UP, dir).normalize();
    upV.crossVectors(dir, rightV).normalize();
    const ins = insets();
    const wpp = worldPerPx();
    const ox = (ins.right - ins.left) / 2 * wpp;
    const oy = (ins.bottom - ins.top) / 2 * wpp;
    tmp.copy(target).add(shakeOffset).addScaledVector(rightV, ox).addScaledVector(upV, oy);
    camera.position.copy(tmp).addScaledVector(dir, DISTANCE);
    camera.up.set(0, 1, 0);
    camera.lookAt(tmp);
    const hh = fitShown / zoom / 2;
    camera.left = -hh * aspect; camera.right = hh * aspect;
    camera.top = hh; camera.bottom = -hh;
    camera.updateProjectionMatrix();
  }

  function dispose() {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('contextmenu', onContext);
    removeEventListener('keydown', onKeyDown);
    removeEventListener('keyup', onKeyUp);
    removeEventListener('blur', onBlur);
  }

  return {
    camera, target, setBounds, resize, update, shake, focus, dispose,
    get yaw() { return yaw; },
    get zoom() { return zoom; },
    setZoom(z, ease = false) { zoomGoal = THREE.MathUtils.clamp(z, ZOOM_MIN, ZOOM_MAX); if (!ease) zoom = zoomGoal; },
    get dragging() { return dragging; },
    get lastInput() { return lastInput; },
    get goal() { return goal.clone(); },
    get zoomGoal() { return zoomGoal; },
  };
}
