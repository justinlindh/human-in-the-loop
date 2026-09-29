// The pose lab: one character in one posture, gesture and camera view, with a scrubber, overlays for the
// skeleton and the hand-to-eye rays, live readouts, and sliders on the render constants --param reaches.
// Served by scripts/tools/lab.mjs (pose-lab.html). Every number comes from blender/checks/pose-measure.js
// and pose-cover.js, the code pose.mjs runs, so the lab and the checks cannot disagree.
import * as THREE from 'three';

const KEY = 'poselab';
const saved = (() => { try { return JSON.parse(sessionStorage.getItem(KEY) ?? '{}'); } catch { return {}; } })();
const q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };

const state = {
  under: 'typing', gesture: 'facepalm', view: 0, build: 1, rig: true, yaw: 0, seconds: 2.2, warm: 1, fps: 30,
  frame: 0, zoom: 1, skeleton: true, rays: true,
  ...saved.state,
  ...Object.fromEntries([...q].map(([k, v]) => [k, ['under', 'gesture'].includes(k) ? v : Number(v)])),
};
let changed = saved.changed ?? {};   // 'file:NAME[i]' or 'file:NAME' -> value
let defaults = [];

const persist = () => { try { sessionStorage.setItem(KEY, JSON.stringify({ state, changed })); } catch { /* private mode */ } };
const specsOf = () => Object.entries(changed).map(([k, v]) => `${k}=${v}`);
const status = (msg, err = false) => { const s = $('status'); if (s) { s.textContent = msg; s.className = err ? 'err' : ''; } };

// The server applies the saved overrides before any game module loads.
try {
  const r = await fetch('/__lab/params', { method: 'POST', body: JSON.stringify({ specs: specsOf() }) });
  const j = await r.json();
  if (j.error) { changed = {}; persist(); }
  defaults = await (await fetch('/__lab/params')).json();
} catch { defaults = []; }

const [{ createPoseRun }, { measureCovers }, { getTemplate }, { ANIMS }] = await Promise.all([
  import('/blender/checks/pose-measure.js'),
  import('/blender/checks/pose-cover.js'),
  import('/src/render/models.js'),
  import('/src/render/character.js'),
]);

// ---- scene -------------------------------------------------------------------------------------------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setClearColor(0x2b2f3a);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8); sun.position.set(3, 6, 4); scene.add(sun);
const floor = new THREE.Mesh(new THREE.CircleGeometry(1.2, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3a4050 }));
scene.add(floor);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
const PITCH = Math.atan(1 / Math.SQRT2);
const CENTER = new THREE.Vector3(0, 0.55, 0);
const toCamera = (view) => { const y = Math.PI / 4 + (view * Math.PI) / 2; return new THREE.Vector3(Math.sin(y) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(y) * Math.cos(PITCH)); };
function fit() {
  const stage = $('stage'), w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.setSize(w, h, false);
  const hh = 0.85 / state.zoom, hw = hh * (w / h);
  Object.assign(camera, { left: -hw, right: hw, top: hh, bottom: -hh });
  camera.updateProjectionMatrix();
}
function placeCamera() {
  camera.position.copy(CENTER).addScaledVector(toCamera(state.view), 10);
  camera.lookAt(CENTER);
  camera.updateMatrixWorld(true);
}

// Overlays: skeleton bones and hand-to-eye rays, drawn over everything.
const over = new THREE.Group(); over.renderOrder = 999; scene.add(over);
const lineMat = (c) => new THREE.LineBasicMaterial({ color: c, depthTest: false, transparent: true });
const BONES = [['hips', 'torso'], ['torso', 'neck'], ['neck', 'head'], ['neck', 'armL'], ['armL', 'wristL'], ['neck', 'armR'], ['armR', 'wristR'], ['hips', 'legL'], ['hips', 'legR']];
const bones = BONES.map(() => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), lineMat(0xffb454)); l.renderOrder = 999; l.frustumCulled = false; over.add(l); return l; });
const rays = [0, 1].map((h) => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), lineMat(h ? 0x6bc7ff : 0xff6b9d)); l.renderOrder = 999; l.frustumCulled = false; over.add(l); return l; });
const setLine = (l, a, b) => { const p = l.geometry.attributes.position; p.setXYZ(0, ...a); p.setXYZ(1, ...b); p.needsUpdate = true; };

// ---- the run -----------------------------------------------------------------------------------------
let run = null, frames = [], stepped = 0, busy = null, covers = {};
const COVER_NAMES = ['coverHandEyeNear', 'coverHandEyeL', 'coverHandEyeR', 'coverHandFace'];
const total = () => Math.ceil((state.warm + state.seconds + 0.5) * state.fps);

async function rebuild() {
  if (run) scene.remove(run.character.root);
  run = await createPoseRun({ under: state.under, gesture: state.gesture, seconds: state.seconds, warm: state.warm, fps: state.fps, yawToCamera: state.yaw, view: state.view, rig: state.rig, look: { build: state.build } });
  scene.add(run.character.root);
  frames = []; stepped = 0;
}

async function seek(n) {
  n = Math.max(0, Math.min(total(), Math.round(n)));
  state.frame = n;
  if (busy) { await busy; }
  busy = (async () => {
    if (!run || n < stepped) await rebuild();
    while (stepped < n) { frames[stepped] = run.step(); stepped++; }
    draw();
  })();
  await busy; busy = null;
  persist();
}

function draw() {
  placeCamera();
  const f = frames[stepped - 1] ?? null;
  const J = f?.joints;
  bones.forEach((l, i) => { l.visible = state.skeleton && !!J; if (J) setLine(l, J[BONES[i][0]], J[BONES[i][1]]); });
  rays.forEach((l, h) => { l.visible = state.rays && !!f; if (f) setLine(l, f.hands[h], f.eyes); });
  covers = {};
  if (f) {
    const c = run.character;
    try { covers = measureCovers({ camera }, { root: c.root, head: c.head }, getTemplate('chibi'), COVER_NAMES, [], { width: canvas.width, height: canvas.height }).measures; } catch (e) { status(String(e.message ?? e), true); }
  }
  renderer.render(scene, camera);
  readout(f);
  window.__labFrame = f;
}

// ---- panel -------------------------------------------------------------------------------------------
const fmt = (v, unit) => (v == null ? '-' : unit === '%' ? `${Math.round(v * 100)}%` : unit === 'cm' ? `${(v * 100).toFixed(1)} cm` : String(v));
const READ = [
  ['t', (f) => f.t.toFixed(2) + ' s'], ['phase', (f) => f.phase], ['faceCam', (f) => `${f.faceCam}°`],
  ['hand0Eye', (f) => fmt(f.contact.hand0Eye, 'cm')], ['hand1Eye', (f) => fmt(f.contact.hand1Eye, 'cm')],
  ['hand0Brow', (f) => fmt(f.contact.hand0Brow, 'cm')], ['hand0Face', (f) => fmt(f.contact.hand0Face, 'cm')],
  ...COVER_NAMES.map((n) => [n, () => fmt(covers[n], '%')]),
];
function readout(f) {
  const t = $('read'); if (!t) return;
  t.replaceChildren(...(f ? READ.map(([k, fn]) => el('tr', {}, el('td', { textContent: k }), el('td', { textContent: fn(f) }))) : []));
  const sl = $('scrub'); if (sl) { sl.max = total(); sl.value = state.frame; }
  const fr = $('frameNo'); if (fr) fr.textContent = `${state.frame}/${total()}`;
}

const select = (key, options) => { const s = el('select'); for (const o of options) s.append(el('option', { value: o, textContent: o })); s.value = state[key]; s.onchange = async () => { state[key] = s.value; await rebuildAndSeek(); }; return s; };
async function rebuildAndSeek() { const n = state.frame; if (run) scene.remove(run.character.root); run = null; stepped = 0; await seek(n); }
const slider = (key, min, max, step, onchange) => { const i = el('input', { type: 'range', min, max, step, value: state[key] }); i.oninput = () => { state[key] = Number(i.value); onchange(); }; return i; };

let timer = null;
function play(on) {
  clearInterval(timer);
  $('playBtn').classList.toggle('on', on);
  if (on) timer = setInterval(async () => { if (state.frame >= total()) { play(false); return; } await seek(state.frame + 1); }, 1000 / state.fps);
}

function buildPanel() {
  const p = $('panel');
  const views = el('div', { className: 'row views' }, ...[0, 1, 2, 3].map((v) => { const b = el('button', { textContent: `view ${v}` }); b.classList.toggle('on', state.view === v); b.onclick = async () => { state.view = v; [...views.children].forEach((c, i) => c.classList.toggle('on', i === v)); await rebuildAndSeek(); }; return b; }));
  const builds = el('div', { className: 'row' }, ...[0, 1, 2].map((v) => { const b = el('button', { textContent: `build ${v}` }); b.classList.toggle('on', state.build === v); b.onclick = async () => { state.build = v; [...builds.children].forEach((c, i) => c.classList.toggle('on', i === v)); await rebuildAndSeek(); }; return b; }));
  const toggle = (key, label, after) => { const b = el('button', { textContent: label }); b.classList.toggle('on', !!state[key]); b.onclick = async () => { state[key] = !state[key]; b.classList.toggle('on', !!state[key]); await after(); }; return b; };
  p.append(
    el('h2', { textContent: 'Scene' }),
    el('label', {}, 'gesture', select('gesture', ANIMS)),
    el('label', {}, 'under', select('under', ANIMS)),
    views, builds,
    el('div', { className: 'row' }, toggle('rig', 'rig on (Medium/High)', rebuildAndSeek), toggle('skeleton', 'skeleton', async () => draw()), toggle('rays', 'rays', async () => draw())),
    el('label', {}, 'heading', slider('yaw', -90, 90, 1, () => { rebuildAndSeek(); })),
    el('label', {}, 'zoom', slider('zoom', 0.5, 4, 0.05, () => { fit(); draw(); })),
    el('h2', { textContent: 'Timeline' }),
    el('div', { className: 'row' }, el('button', { id: 'playBtn', textContent: 'play', onclick: () => play(!$('playBtn').classList.contains('on')) }), el('button', { textContent: '◀ 1', onclick: () => seek(state.frame - 1) }), el('button', { textContent: '1 ▶', onclick: () => seek(state.frame + 1) }), el('span', { id: 'frameNo' })),
    el('input', { id: 'scrub', type: 'range', min: 0, max: total(), step: 1, value: state.frame, oninput: (e) => seek(Number(e.target.value)) }),
    el('h2', { textContent: 'Measures (the numbers pose.mjs prints)' }),
    el('table', {}, el('tbody', { id: 'read' })),
    el('h2', { textContent: 'Constants' }),
    el('div', { className: 'row' }, el('button', { textContent: 'copy diff', onclick: () => copy(diffText(), 'diff') }), el('button', { textContent: 'copy --param', onclick: () => copy(specsOf().map((s) => `--param ${s}`).join(' '), '--param flags') }), el('button', { textContent: 'reset', onclick: () => { changed = {}; persist(); location.reload(); } })),
    el('div', { id: 'status' }),
    el('input', { id: 'filter', placeholder: 'filter constants', oninput: (e) => paramList(e.target.value), style: 'width:100%;margin:6px 0' }),
    el('div', { id: 'params' }),
  );
  paramList('');
}

const keyOf = (c, i) => (Array.isArray(c.value) ? `${c.file}:${c.name}[${i}]` : `${c.file}:${c.name}`);
function paramList(filter) {
  const box = $('params'); box.replaceChildren();
  const f = filter.toLowerCase();
  for (const c of defaults.filter((d) => !f || d.name.toLowerCase().includes(f))) {
    const vals = Array.isArray(c.value) ? c.value : [c.value];
    const wrap = el('div', { className: 'param' }, el('b', { textContent: `${c.name}${Array.isArray(c.value) ? ` (${vals.length})` : ''}` }));
    vals.forEach((v0, i) => {
      const k = keyOf(c, i), cur = changed[k] ?? v0, span = Math.max(0.5, Math.abs(v0) * 1.5);
      const num = el('input', { type: 'number', step: 0.005, value: +cur.toFixed(4) });
      const rng = el('input', { type: 'range', min: v0 - span, max: v0 + span, step: 0.005, value: cur });
      const set = (x) => { const n = Number(x); if (!Number.isFinite(n)) return; if (Math.abs(n - v0) < 1e-9) delete changed[k]; else changed[k] = +n.toFixed(4); wrap.classList.toggle('changed', vals.some((_, j) => keyOf(c, j) in changed)); num.value = n; rng.value = n; persist(); schedule(); };
      rng.oninput = () => set(rng.value); num.onchange = () => set(num.value);
      wrap.append(rng, num);
    });
    wrap.classList.toggle('changed', vals.some((_, j) => keyOf(c, j) in changed));
    box.append(wrap);
  }
}

let applying = null;
function schedule() { clearTimeout(applying); status('applying...'); applying = setTimeout(apply, 400); }
async function apply() {
  const r = await fetch('/__lab/params', { method: 'POST', body: JSON.stringify({ specs: specsOf() }) });
  const j = await r.json();
  if (j.error) { status(j.error, true); return; }
  persist(); location.reload();
}

function diffText() {
  const by = new Map();
  for (const c of defaults) {
    const vals = Array.isArray(c.value) ? c.value : [c.value];
    const now = vals.map((v, i) => changed[keyOf(c, i)] ?? v);
    if (now.some((v, i) => v !== vals[i])) by.set(c, now);
  }
  const show = (c, vals) => (Array.isArray(c.value) ? `[${vals.join(', ')}]` : String(vals[0]));
  return [...by].map(([c, now]) => `--- ${c.file}\n-const ${c.name} = ${show(c, Array.isArray(c.value) ? c.value : [c.value])};\n+const ${c.name} = ${show(c, now)};`).join('\n') || '(no changes)';
}
async function copy(text, what) {
  try { await navigator.clipboard.writeText(text); status(`copied ${what}`); }
  catch { const t = el('textarea', { value: text }); document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); status(`copied ${what}`); }
}

// ---- go ---------------------------------------------------------------------------------------------
buildPanel();
addEventListener('resize', () => { fit(); if (run) draw(); });
fit();
await seek(state.frame);
window.__lab = { state, seek, frames: () => frames, covers: () => covers, diff: diffText, changed: () => changed, canvas };
