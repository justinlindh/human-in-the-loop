import * as THREE from 'three';

// Orthographic isometric camera: yaw 45 degrees plus 90 degree steps, pitch atan(1/sqrt(2)).
const PITCH = Math.atan(1 / Math.SQRT2);
const DISTANCE = 60;
const ZOOM_MIN = 0.7;
const ZOOM_MAX = 3.2;

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
  let aspect = 1;
  let shakeTime = 0;
  let shakeDur = 0;
  let shakeAmp = 0;
  const keys = new Set();

  const tmp = new THREE.Vector3();
  const right = new THREE.Vector3();
  const fwd = new THREE.Vector3();

  function viewDir(y) {
    return new THREE.Vector3(Math.sin(y) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(y) * Math.cos(PITCH));
  }

  // Fit the bounds box into the view at the current yaw.
  function refit() {
    const dir = viewDir(yawGoal);
    const up = new THREE.Vector3(0, 1, 0);
    const r = new THREE.Vector3().crossVectors(up, dir).normalize();
    const u = new THREE.Vector3().crossVectors(dir, r).normalize();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const c = bounds.getCenter(new THREE.Vector3());
    for (let i = 0; i < 8; i++) {
      tmp.set(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z).sub(c);
      const x = tmp.dot(r), y = tmp.dot(u);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    fitHeight = Math.max(maxY - minY, (maxX - minX) / aspect) * 1.12;
  }

  function setBounds(box, recenter = true) {
    bounds.copy(box);
    refit();
    if (recenter) {
      const c = box.getCenter(new THREE.Vector3());
      goal.set(c.x, c.y, c.z);
      target.copy(goal);
    }
  }

  function resize(w, h) {
    aspect = w / Math.max(1, h);
    refit();
  }

  function clampGoal() {
    const pad = 1.5;
    goal.x = THREE.MathUtils.clamp(goal.x, bounds.min.x - pad, bounds.max.x + pad);
    goal.z = THREE.MathUtils.clamp(goal.z, bounds.min.z - pad, bounds.max.z + pad);
  }

  function panScreen(dxPx, dyPx) {
    const h = canvas.clientHeight || 1;
    const worldPerPx = fitHeight / zoom / h;
    const dir = viewDir(yaw);
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    fwd.set(-dir.x, 0, -dir.z).normalize();
    // Screen up maps to ground forward scaled by 1/sin(pitch) because the ground is foreshortened.
    goal.addScaledVector(right, -dxPx * worldPerPx);
    goal.addScaledVector(fwd, (dyPx * worldPerPx) / Math.sin(PITCH));
    clampGoal();
  }

  // Input
  let dragging = false;
  let lastX = 0, lastY = 0;
  const onDown = (e) => {
    if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!dragging) return;
    panScreen(e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX; lastY = e.clientY;
  };
  const onUp = (e) => { dragging = false; canvas.releasePointerCapture?.(e.pointerId); };
  const onWheel = (e) => {
    e.preventDefault();
    zoomGoal = THREE.MathUtils.clamp(zoomGoal * Math.exp(-e.deltaY * 0.0015), ZOOM_MIN, ZOOM_MAX);
  };
  const typing = (e) => {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  };
  const onKeyDown = (e) => {
    if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'q') yawGoal -= Math.PI / 2;
    else if (k === 'e') yawGoal += Math.PI / 2;
    else if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) keys.add(k);
    if (k === 'q' || k === 'e') refit();
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

  function focus(point, zoomTo = null) {
    goal.set(point.x, 0.6, point.z);
    clampGoal();
    if (zoomTo) zoomGoal = THREE.MathUtils.clamp(zoomTo, ZOOM_MIN, ZOOM_MAX);
  }

  function update(dt) {
    const speed = 900 * dt;
    let kx = 0, ky = 0;
    if (keys.has('a') || keys.has('arrowleft')) kx += speed;
    if (keys.has('d') || keys.has('arrowright')) kx -= speed;
    if (keys.has('w') || keys.has('arrowup')) ky += speed;
    if (keys.has('s') || keys.has('arrowdown')) ky -= speed;
    if (kx || ky) panScreen(kx, ky);

    const k = 1 - Math.exp(-dt * 10);
    target.lerp(goal, k);
    yaw += (yawGoal - yaw) * (1 - Math.exp(-dt * 8));
    zoom += (zoomGoal - zoom) * k;

    shakeOffset.set(0, 0, 0);
    if (shakeTime > 0) {
      shakeTime = Math.max(0, shakeTime - dt);
      const a = shakeAmp * (shakeTime / shakeDur);
      const t = performance.now() * 0.05;
      shakeOffset.set(Math.sin(t * 1.7) * a, Math.sin(t * 2.3) * a * 0.5, Math.cos(t * 1.9) * a);
    }

    const dir = viewDir(yaw);
    camera.position.copy(target).addScaledVector(dir, DISTANCE).add(shakeOffset);
    camera.up.set(0, 1, 0);
    camera.lookAt(tmp.copy(target).add(shakeOffset));
    const hh = fitHeight / zoom / 2;
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
    setZoom(z) { zoomGoal = zoom = THREE.MathUtils.clamp(z, ZOOM_MIN, ZOOM_MAX); },
    get dragging() { return dragging; },
  };
}
