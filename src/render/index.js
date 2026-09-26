import * as THREE from 'three';
import { spotDebug } from './spots.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { createSceneGraph } from './scene.js';
import { createCameraRig } from './camera.js';
import { createLighting, createBackdrop } from './lighting.js';
import { createPost } from './post.js';
import { createFly } from './fly.js';
import { setRingsShown } from './character.js';
import { buildKitBoard, buildPropLineup, buildItemLineup, buildCharLineup, buildCharTurnaround, buildIconBoard } from './debug.js';
import { setGlowScale, mat } from './materials.js';
import { loadModels } from './models.js';
import { setRigEnabled } from './rig.js';
import { createScreens } from './screens.js';
import { createOffice } from './office.js';
import { createProps } from './props.js';
import { createSurroundings } from './surroundings.js';
import { isSoftwareRenderer } from '../quality.js';
import { createProbe } from './probe.js';
import { createLabels } from './labels.js';
import { createFx } from './fx.js';
import { createStaffSync } from './sync.js';
import { createBuild } from './build.js';
import { createPortraits } from './portraits.js';
import { createRival } from './rival.js';

const STAGE_ZOOM = [1, 1.05, 1.25];

const WILT_WEEKS = 16;
const RECOVER_WEEKS = 6;
function lockdownLevel(state) {
  const L = state.lockdown;
  if (!L) return { dim: 0, wilt: 0 };
  const w = state.week ?? 0;
  if (w < L.until) return { dim: 1, wilt: Math.min(1, Math.max(0, (w - L.since) / WILT_WEEKS)) };
  const peak = Math.min(1, Math.max(0, (L.until - L.since) / WILT_WEEKS));
  return { dim: 0, wilt: peak * Math.max(0, 1 - (w - L.until) / RECOVER_WEEKS) };
}

// Wilting tints the shared leaf materials toward dry brown (every plant uses them).
const LEAVES = ['leaf', 'leaf_dark', 'leaf_light'];
const WILT_TO = new THREE.Color('#a08a5a');
let wiltSeen = -1;
const leafBase = new Map();
function setWilt(k) {
  if (Math.abs(k - wiltSeen) < 0.01) return;
  wiltSeen = k;
  for (const n of LEAVES) {
    const m = mat(n);
    if (!leafBase.has(n)) leafBase.set(n, m.color.clone());
    m.color.copy(leafBase.get(n)).lerp(WILT_TO, 0.7 * k);
  }
}

const DEBUG_VIEWS = {
  kit: { '1': buildKitBoard },
  props: { '1': buildPropLineup },
  items: { '1': buildItemLineup },
  chars: { '1': buildCharLineup, '2': buildCharTurnaround },
  icons: { objects: (g) => buildIconBoard(g, labelsElRef) },
};

let labelsElRef = null;

const BLOOM = 0.55;          // the bloom pass's strength (post.js)
const FLY_BLOOM = 0.3;       // its strength while the flying camera is on
const FLY_NEAR = 1.5;        // metres from the flying camera within which a person is warned about

export function createRenderer({ canvas, labelsEl, quality = 'high' }) {
  labelsElRef = labelsEl;
  let q = ['low', 'medium', 'high'].includes(quality) ? quality : 'high';

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Counters cover every pass of a frame (shadows, AO, main, post), reset once per frame.
  renderer.info.autoReset = false;
  const perf = { calls: 0, triangles: 0, ms: 0, frames: 0 };

  const labels = new CSS2DRenderer();
  labels.domElement.style.position = 'absolute';
  labels.domElement.style.inset = '0';
  labels.domElement.style.pointerEvents = 'none';
  labelsEl?.appendChild(labels.domElement);

  const { scene, office: debugRoot } = createSceneGraph();
  const rig = createCameraRig(canvas);
  const lighting = createLighting(scene, { shadowSize: q === 'low' ? 1024 : 2048 });
  const backdrop = createBackdrop();
  scene.background = backdrop.texture;
  lighting.env.listeners.add(backdrop.update);
  const screens = createScreens();

  const params = new URLSearchParams(location.search);
  // Authored clips for the poses the rig covers are the default look; Low quality (and ?rig=0) keeps
  // the lighter procedural poses. ?rig=1 forces the rig on at any quality.
  const rigParam = params.get('rig');
  const rigWanted = () => (rigParam === '1' ? true : rigParam === '0' ? false : q !== 'low');
  const rigLoaded = setRigEnabled(rigWanted());
  let debugBuild = null;
  for (const [k, views] of Object.entries(DEBUG_VIEWS)) if (views[params.get(k)]) debugBuild = views[params.get(k)];

  let office = null;
  let props = null;
  let surroundings = null;
  let probeImpl = null;
  const charOf = (x) => staff?.charOf(x) ?? staff?.moments?.extras?.().find((e) => e.id === x)?.char ?? null;
  // A staged prop by its state id, or by its kind ('pizza_boxes') when one of that kind stands.
  const propOf = (x) => props?.objectOf?.(x) ?? props?.current?.().find((p) => p.prop === x)?.obj ?? null;
  const probeFor = () => (probeImpl ??= createProbe({ scene, camera: rig.camera, office, charOf, stagingOf: (x) => staff?.moments?.staging?.(x) }));
  let staff = null;
  let build = null;
  let rival = null;
  const labelLayer = new THREE.Group();
  labelLayer.name = 'labels';
  scene.add(labelLayer);
  const floating = createLabels(labelLayer);
  const fx = createFx({ scene, overlayEl: labelsEl });
  let ready = false;
  const portraits = createPortraits({ ready: () => ready, lowQuality: () => q === 'low' });
  let firstStage = true;
  if (debugBuild) {
    const b = debugBuild(debugRoot);
    // The view builds when its models load; ready follows a tick later, once it has built.
    Promise.all([loadModels(), rigLoaded]).then(() => Promise.resolve()).then(() => { ready = true; });
    rig.setBounds(b);
    lighting.fitShadow(b);
    lighting.setInteriorLights([{ x: -2, y: 2.4, z: -2 }, { x: 2, y: 2.4, z: 2 }]);
  } else {
    office = createOffice({ parent: scene, screens, lighting, low: () => q === 'low' });
    props = createProps(office, screens);
    surroundings = createSurroundings({ parent: scene, low: () => q === 'low', lighting });
    staff = createStaffSync({ office, parent: scene, labels: floating, fx, rig, caricature: (p) => portraits.caricature(p), setDim: (k) => { partyDim = k; }, setAccent: (p, i, c) => lighting.setAccent(p, i, c), setPictureLight: (a, b, i) => lighting.setPictureLight(a, b, i), getProps: () => props, low: () => q === 'low' });
    build = createBuild({ office, getCamera: () => rig.camera, canvas });
    rival = createRival({ office });
    Promise.all([loadModels(), rigLoaded]).then(() => { ready = true; });
  }
  const applyDebugCamera = () => {
    if (params.get('zoom')) rig.setZoom(Number(params.get('zoom')));
    if (params.get('at')) {
      const [ax, az] = params.get('at').split(',').map(Number);
      rig.focus({ x: ax, z: az });
      rig.update(10);
    }
  };
  if (debugBuild) applyDebugCamera();

  function size() {
    return { w: canvas.clientWidth || innerWidth, h: canvas.clientHeight || innerHeight };
  }
  // Software GL draws every pixel on the CPU, so Low renders it at three quarters scale.
  const softwareGL = (() => {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return isSoftwareRenderer(String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)));
  })();
  function pixelRatio() {
    return q === 'low' ? (softwareGL ? 0.75 : 1) : Math.min(devicePixelRatio || 1, 2);
  }

  renderer.setPixelRatio(pixelRatio());
  const s0 = size();
  renderer.setSize(s0.w, s0.h, false);
  const post = createPost(renderer, scene, rig.camera, q);
  // The dev flying camera (fly.js): a keyframed perspective camera for trailer shots.
  const fly = createFly({ getWallH: () => office?.current?.L?.wallH ?? 3 });
  let tiltWanted = true, flyCamOn = false;

  function applyQuality() {
    setRigEnabled(rigWanted());
    lighting.setShadowSize(q === 'low' ? 1024 : 2048);
    lighting.setInteriorBudget(q === 'low' ? 2 : 6);
    surroundings?.setQuality();
    staff?.setCharacterShadows(q !== 'low');
    setGlowScale(q === 'low' ? 0.45 : 1);
    screens.setBrightness(q === 'low' ? 1.0 : 1.7);
  }
  applyQuality();

  function resize() {
    const { w, h } = size();
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(w, h, false);
    post.setSize(w, h);
    labels.setSize(w, h);
    rig.resize(w, h);
    fly.camera.aspect = w / h;
    fly.camera.updateProjectionMatrix();
  }
  resize();

  let timeOfDay = 0.45;
  let lastT = -1;
  let pendingUpgrade = false;
  let stageJustBuilt = false;
  let buildSig = '';
  let partyDim = 0;
  let speedZero = false;
  let menuPaused = false;
  let firstSync = true;

  let decisionOpen = false;
  function sync(state) {
    decisionOpen = !!state?.pendingDecision;
    if (!office || !ready || !state) return;
    const stage = state.officeStage ?? 0;
    const moving = !firstStage && pendingUpgrade;
    if (office.setStage(stage, { animate: moving, expansion: state.office?.expansion ?? 0 })) {
      stageJustBuilt = true;
      surroundings?.setStage(stage, office.current.L);
      rig.setBounds(office.bounds, true, moving);
      // The big HQ floor starts a little closer so seated staff read; the whole office is a scroll away.
      rig.setZoom(STAGE_ZOOM[stage] ?? 1, moving);
      if (firstStage) applyDebugCamera();
      firstStage = false;
      pendingUpgrade = false;
    }
    // Era dressing; a change after the first build gets the window-light swell.
    if (office.setEra(state.era?.id ?? 'classic')) {
      screens.setEra(office.era, !stageJustBuilt && !firstSync);
      lighting.setEraTone(office.era);
    }
    firstSync = false;
    const changed = office.setPlaced(state.office?.placed ?? []);
    if (!stageJustBuilt) for (const c of changed) fx.pop(c.obj);
    props?.sync(state);
    // Placement validity depends on cash, the week, and what is placed; recheck when any changes.
    const sig = `${state.week}|${state.cash}|${changed.length}|${state.office?.placed?.length ?? 0}`;
    if (sig !== buildSig) { buildSig = sig; build?.invalidate(); }
    stageJustBuilt = false;
    screens.setAutomation(state.automation);
    // Lockdown: the office empties, plants wilt over time and recover after, the lights dim.
    const lk = lockdownLevel(state);
    lighting.setSkeleton(Math.max(lk.dim, partyDim));
    setWilt(lk.wilt);
    staff.sync(state);
    rival?.sync(state);
  }

  function handleEvents(events, state) {
    for (const e of events ?? []) {
      if (e.type === 'officeUpgrade') pendingUpgrade = true;
      if (e.type === 'incident' && !e.caught) screens.alarm(3);
    }
    staff?.handleEvents(events, state);
  }

  const api = {
    scene, camera: rig.camera, env: lighting.env,
    sync,
    handleEvents,
    setTimeOfDay(t) {
      timeOfDay = t;
      if (Math.abs(t - lastT) < 0.0005) return;
      lastT = t;
      lighting.setTimeOfDay(t);
    },
    setQuality(nq) {
      if (!['low', 'medium', 'high'].includes(nq)) return;
      q = nq;
      applyQuality();
      post.setQuality(q);
      office?.setQuality();
      resize();
    },
    setTiltShift(on) { tiltWanted = !!on; if (!fly.active) post.setTiltShift(tiltWanted); },
    // Dev only: fly the perspective camera along a keyframed path (fly.js), or null to hand back.
    fly(path) {
      fly.set(path);
      post.setTiltShift(fly.active ? !!path.tilt : tiltWanted);
      labels.domElement.style.display = fly.active && !path.labels ? 'none' : '';
      setRingsShown(!fly.active || !!path.rings);
    },
    get flying() { return fly.active ? { t: +fly.t.toFixed(2), warnings: fly.warnings.slice() } : null; },
    setRig(on) { setRigEnabled(on); },
    // Speed 0 or a menu pause freezes the diorama (camera and build mode keep working).
    setSpeed(k) { speedZero = k === 0; if (k > 0) staff?.setSpeed(k); },
    setPaused(on) { menuPaused = !!on; },
    get paused() { return speedZero || menuPaused; },
    // Models loaded: the office and people can be built (headless checks wait on this).
    get ready() { return ready; },
    // Menu portraits from the office character builder (see portraits.js).
    portrait(person, opts) { return portraits.portrait(person, opts); },
    portraitLive(person, opts) { return portraits.portraitLive(person, opts); },
    // A celebrating big-head render (the framed caricature), as a canvas.
    caricature(person, px) { return portraits.caricature(person, px); },
    get portraitStats() { return portraits.stats; },
    // Build mode (see build.js): null, { select: true }, or { itemId, rot, level?, moveId?, validate? }.
    setBuildMode(m) { build?.setMode(m); },
    // validate(x, y, rot) -> boolean | { ok, reason }; the UI supplies it from the sim.
    set validate(fn) { if (build) build.validator = fn; },
    get validate() { return build?.validator ?? null; },
    pickTile(x, y) { return build?.pickTile(x, y) ?? null; },
    // Touch build mode: aim the ghost at the tile under a screen point; returns the placement corner.
    aimBuild(x, y) { return build?.aim(x, y) ?? null; },
    get buildGrabbing() { return !!build?.grabbing; },
    pickPlaced(x, y) { return build?.pickPlaced(x, y) ?? null; },
    // Warm plates under these placed ids (adjacency preview); null clears.
    highlightItems(ids) { build?.highlightItems(ids); },
    // The ghost's anchor tile and rotation, plus whether the validator accepted it.
    get buildTarget() { return build?.target ?? null; },
    get hoverPlaced() { return build?.hoverId ?? null; },
    // Steps characters, labels, and effects without drawing (for headless verification).
    advance(seconds, step = 1 / 30) {
      for (let t = 0; t < seconds; t += step) { office?.update(step, { yaw: rig.yaw, env: lighting.env }); staff?.update(step); floating.update(step); fx.update(step); props?.update(step); }
    },
    // Where a picked thing is on screen, for anchoring UI (tooltips): { left, top, width, height } in
    // client pixels, from its bounding box. kind: 'staff' | 'item' (as pick() returns); null if absent.
    screenRectOf({ kind, id } = {}) {
      let obj = null;
      if (kind === 'item') obj = office?.placed.get(id)?.obj ?? null;
      else if (kind === 'staff') scene.traverse((o) => { if (!obj && o.userData.staffId === id) obj = o.parent; });
      if (!obj || !obj.visible) return null;
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj);
      if (box.isEmpty()) return null;
      const r = canvas.getBoundingClientRect(), v = new THREE.Vector3();
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(rig.camera);
        const x = r.left + ((v.x + 1) / 2) * r.width, y = r.top + ((1 - v.y) / 2) * r.height;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      return { left: x0, top: y0, width: x1 - x0, height: y1 - y0 };
    },
    pick(x, y) {
      const r = staff ? staff.pick(x, y, rig.camera, canvas) : { kind: null, id: null };
      if (r.kind) return r;
      const id = build?.pickPlaced(x, y);
      return id ? { kind: 'item', id } : r;
    },
    // Ease the camera to a world point (dev and snap use).
    focusAt(x, z, zoom = 2.5) { rig.focus({ x, y: 0.4, z }, zoom); rig.update(10); },
    // The same, eased: the camera glides there at `rate` (as the moment camera does) instead of jumping.
    easeTo(x, z, zoom = 2.5, rate = 2, y = 0.4) { rig.focus({ x, y, z }, zoom, rate); },
    // The spotlight moment playing now (spotlight.js): null or { kind, key, since }. main.js holds the
    // game clock while there is one; endSpotlight() cuts it short (the Skip control).
    spotlight() { return staff?.spotlights?.current() ?? null; },
    endSpotlight() { return staff?.endSpotlight() ?? false; },
    // Where the camera looks now, and its zoom.
    view() { const t = rig.target; return { x: t.x, y: t.y, z: t.z, zoom: rig.zoom }; },
    focusStaff(id) {
      const p = staff?.positionOf(id);
      if (p) rig.focus({ x: p.x, y: 0.6, z: p.z }, 1.9);
    },
    resize,
    // draw: false runs every update of a frame without drawing it (stepping a check to a pose).
    render(dt, { draw = true } = {}) {
      const t0 = performance.now();
      renderer.info.reset();
      rig.update(dt);
      const flying = fly.step(dt);
      const cam = flying ? fly.camera : rig.camera;
      if (flying !== flyCamOn) {
        flyCamOn = flying;
        post.setCamera(cam);
        // Up close a lamp or a glowing stack fills more of the frame: bloom is held lower in flight.
        post.bloom.strength = flying ? FLY_BLOOM : BLOOM;
      }
      // Someone standing right by the flying camera fills the frame edge as a big soft head.
      if (flying && staff) {
        for (const p of staff.positions()) {
          if (Math.hypot(p.x - cam.position.x, p.z - cam.position.z) < FLY_NEAR && cam.position.y < 2.6) { fly.warn('near', { x: +p.x.toFixed(2), z: +p.z.toFixed(2) }); break; }
        }
      }
      lighting.setViewYaw(rig.yaw);
      debugRoot.userData.update?.(dt);
      const paused = speedZero || menuPaused;
      const simDt = paused ? 0 : dt;
      office?.update(dt, { yaw: rig.yaw, env: lighting.env });
      surroundings?.setViewYaw(rig.yaw);
      surroundings?.update(dt, lighting.env);
      if (staff && office && (!flying || fly.path.fade)) office.fadeColumns(cam, staff.positions(), dt);
      // A screen takeover is a staged moment: it plays on behind a decision card.
      screens.update(screens.overlay && !speedZero ? dt : simDt, lighting.env);
      // A decision holds the office still, except the moment it stages (unless the game is paused).
      staff?.update(dt, { paused, moments: paused && !speedZero });
      floating.update(simDt, decisionOpen && !speedZero ? dt : simDt);
      fx.update(simDt, dt);
      props?.update(dt);
      build?.update(dt, scene);
      portraits.update(dt);
      lighting.setAlarm(fx.alarmLevel);
      scene.updateMatrixWorld();
      // Skipping the draw is exact only while post keeps no state between frames (golden checks this).
      if (draw) post.render(dt);
      labels.render(scene, cam);
      const ls = labels.getSize();
      floating.layout(dt, cam, ls.width, ls.height, labels.domElement);
      perf.calls = renderer.info.render.calls;
      perf.triangles = renderer.info.render.triangles;
      perf.ms = perf.frames ? perf.ms * 0.9 + (performance.now() - t0) * 0.1 : performance.now() - t0;
      perf.frames++;
    },
    dispose() {
      rig.dispose();
      post.dispose();
      renderer.dispose();
      labels.domElement.remove();
    },
    get timeOfDay() { return timeOfDay; },
    get office() { return office; },
    // Checks: catch someone in a temp (a standup, a pose) and optionally mid-walk to a far point,
    // as the decision freeze may find them.
    catchFor(id, temp, { walk = false } = {}) { return staff?.catchFor?.(id, temp, { walk }) ?? false; },
    // Whether someone has a speech bubble up now (checks).
    isSpeaking(id) { const root = staff?.charOf(id)?.root; return !!root && floating.speaking(root); },
    // Staged props (props.js), for checks.
    get props() { return props; },
    // Draw calls and triangles for the last frame (all passes) and a smoothed CPU frame time.
    get perf() {
      let meshes = 0;
      scene.traverseVisible((o) => { if (o.isMesh) meshes++; });
      return { calls: perf.calls, triangles: perf.triangles, cpuMs: +perf.ms.toFixed(1), meshes, programs: renderer.info.programs?.length ?? 0, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
    },
    // Dev and snap hook: perk visits (send people to a placed item, counts).
    get perks() { return staff?.perks ?? null; },
    get moments() { return staff?.moments ?? null; },
    // Dev and check tools: the page's own three.js, for measuring objects in page scripts.
    get THREE() { return import.meta.env?.DEV ? THREE : undefined; },
    // Staging probe (probe.js): how staff member `id` reads on screen this frame.
    // A staff id or a moment's own actor ('visitor:0'); for a staged prop (its id or its kind), how
    // much of it the camera sees and what hides it.
    probe(id) {
      const P = probeFor();
      if (charOf(id)) return P.measure(id);
      const prop = propOf(id);
      if (!prop) return null;
      const [v] = P.seen(prop, [0]);
      return { visible: v.visible, occluder: v.occluder };
    },
    // How much of an actor or staged prop each camera turn sees (0: this view, n: n presses of E),
    // and what hides it: [{ view, visible, occluder, blocked }].
    probeViews(id, views = [0, 1, 2, 3]) {
      const root = charOf(id)?.root ?? propOf(id);
      return root ? probeFor().seen(root, views) : null;
    },
    isSeated(id) { return staff?.isSeated(id) ?? false; },
    walkOf(id) { return staff?.walkOf(id) ?? null; },
    // The moment ownership trace (sync.js): trace.on = true, then trace.lines(n).
    get debug() { return office ? spotDebug(office) : null; },
    get trace() { return staff?.trace ?? null; },
    get incentives() { return staff?.incentives ?? null; },
    standAt(id, x, z) { return staff?.standAt(id, x, z) ?? false; },
    get pets() { return staff?.pets ?? null; },
    get incentivesFrame() { return staff?.incentives.frameAt ?? null; },
    get stats() { return { perkVisits: staff?.perks.visiting ?? 0, standup: staff?.standup ?? null, labels: floating.count, confetti: fx.liveConfetti, staff: staff?.count ?? 0, leavers: staff?.leaverCount ?? 0 }; },
  };
  // Dev builds expose the renderer for snap-tool experiments (never read by game code).
  if (import.meta.env?.DEV) window.__hitlRender = api;
  return api;
}
