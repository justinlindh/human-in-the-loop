import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { createSceneGraph } from './scene.js';
import { createCameraRig } from './camera.js';
import { createLighting, createBackdrop } from './lighting.js';
import { createPost } from './post.js';
import { buildKitBoard, buildPropLineup, buildItemLineup, buildCharLineup, buildCharTurnaround, buildIconBoard } from './debug.js';
import { setGlowScale } from './materials.js';
import { loadModels } from './models.js';
import { createScreens } from './screens.js';
import { createOffice } from './office.js';
import { createLabels } from './labels.js';
import { createFx } from './fx.js';
import { createStaffSync } from './sync.js';

const DEBUG_VIEWS = {
  kit: { '1': buildKitBoard },
  props: { '1': buildPropLineup },
  items: { '1': buildItemLineup },
  chars: { '1': buildCharLineup, '2': buildCharTurnaround },
  icons: { objects: (g) => buildIconBoard(g, labelsElRef) },
};

let labelsElRef = null;

export function createRenderer({ canvas, labelsEl, quality = 'high' }) {
  labelsElRef = labelsEl;
  let q = ['low', 'medium', 'high'].includes(quality) ? quality : 'high';

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

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
  let debugBuild = null;
  for (const [k, views] of Object.entries(DEBUG_VIEWS)) if (views[params.get(k)]) debugBuild = views[params.get(k)];

  let office = null;
  let staff = null;
  const labelLayer = new THREE.Group();
  labelLayer.name = 'labels';
  scene.add(labelLayer);
  const floating = createLabels(labelLayer);
  const fx = createFx({ scene, overlayEl: labelsEl });
  let ready = false;
  let firstStage = true;
  if (debugBuild) {
    const b = debugBuild(debugRoot);
    rig.setBounds(b);
    lighting.fitShadow(b);
    lighting.setInteriorLights([{ x: -2, y: 2.4, z: -2 }, { x: 2, y: 2.4, z: 2 }]);
  } else {
    office = createOffice({ parent: scene, screens, lighting });
    staff = createStaffSync({ office, parent: scene, labels: floating, fx, rig });
    loadModels().then(() => { ready = true; });
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
  function pixelRatio() {
    return q === 'low' ? 1 : Math.min(devicePixelRatio || 1, 2);
  }

  renderer.setPixelRatio(pixelRatio());
  const s0 = size();
  renderer.setSize(s0.w, s0.h, false);
  const post = createPost(renderer, scene, rig.camera, q);

  function applyQuality() {
    lighting.setShadowSize(q === 'low' ? 1024 : 2048);
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
  }
  resize();

  let timeOfDay = 0.45;
  let lastT = -1;
  let pendingUpgrade = false;
  let stageJustBuilt = false;

  function sync(state) {
    if (!office || !ready || !state) return;
    const stage = state.officeStage ?? 0;
    if (office.setStage(stage, { animate: !firstStage && pendingUpgrade })) {
      stageJustBuilt = true;
      rig.setBounds(office.bounds, true);
      if (firstStage) applyDebugCamera();
      firstStage = false;
      pendingUpgrade = false;
    }
    const changed = office.setItems(state.items ?? []);
    if (!stageJustBuilt) for (const c of changed) fx.pop(c.obj);
    stageJustBuilt = false;
    screens.setAutomation(state.automation);
    staff.sync(state);
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
      resize();
    },
    setTiltShift(on) { post.setTiltShift(!!on); },
    pick(x, y) { return staff ? staff.pick(x, y, rig.camera, canvas) : { kind: null, id: null }; },
    focusStaff(id) {
      const p = staff?.positionOf(id);
      if (p) rig.focus({ x: p.x, y: 0.6, z: p.z }, 1.9);
    },
    resize,
    render(dt) {
      rig.update(dt);
      lighting.setViewYaw(rig.yaw);
      debugRoot.userData.update?.(dt);
      office?.update(dt, { yaw: rig.yaw, env: lighting.env });
      screens.update(dt, lighting.env);
      staff?.update(dt);
      floating.update(dt);
      fx.update(dt);
      post.render(dt);
      labels.render(scene, rig.camera);
    },
    dispose() {
      rig.dispose();
      post.dispose();
      renderer.dispose();
      labels.domElement.remove();
    },
    get timeOfDay() { return timeOfDay; },
    get office() { return office; },
    get stats() { return { labels: floating.count, confetti: fx.liveConfetti, staff: staff?.count ?? 0, leavers: staff?.leaverCount ?? 0 }; },
  };
  // Dev builds expose the renderer for snap-tool experiments (never read by game code).
  if (import.meta.env?.DEV) window.__hitlRender = api;
  return api;
}
