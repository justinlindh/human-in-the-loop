import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { createSceneGraph, buildTestDiorama } from './scene.js';
import { createCameraRig } from './camera.js';
import { createLighting, createBackdrop, windowUpdater } from './lighting.js';
import { createPost } from './post.js';
import { buildKitBoard } from './debug.js';

export function createRenderer({ canvas, labelsEl, quality = 'high' }) {
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

  const { scene, office, actors, fx } = createSceneGraph();
  const rig = createCameraRig(canvas);
  const lighting = createLighting(scene, { shadowSize: q === 'low' ? 1024 : 2048 });
  const backdrop = createBackdrop();
  scene.background = backdrop.texture;
  lighting.env.listeners.add(backdrop.update);

  const params = new URLSearchParams(location.search);
  const bounds = params.get('kit') === '1' ? buildKitBoard(office) : buildTestDiorama(office);
  rig.setBounds(bounds);
  lighting.env.listeners.add(windowUpdater(office.userData.windowMaterials ?? []));
  lighting.fitShadow(bounds);
  lighting.setInteriorLights([{ x: -1, y: 2.4, z: -1 }, { x: 2, y: 2.4, z: 1 }]);

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

  return {
    scene, camera: rig.camera, env: lighting.env,
    sync(state) { void state; },
    handleEvents(events, state) { void events; void state; },
    setTimeOfDay(t) {
      timeOfDay = t;
      if (Math.abs(t - lastT) < 0.0005) return;
      lastT = t;
      lighting.setTimeOfDay(t);
    },
    setQuality(nq) {
      if (!['low', 'medium', 'high'].includes(nq)) return;
      q = nq;
      post.setQuality(q);
      resize();
    },
    setTiltShift(on) { post.setTiltShift(!!on); },
    pick() { return { kind: null, id: null }; },
    focusStaff() {},
    resize,
    render(dt) {
      rig.update(dt);
      lighting.setViewYaw(rig.yaw);
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
  };
}
