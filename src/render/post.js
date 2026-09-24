import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';

// Tilt-shift blur that keeps a sharp band around the focus line (the stock shaders blur
// linearly from a single line, which softens the center of the office too).
function tiltShader(horizontal) {
  return {
    uniforms: { tDiffuse: { value: null }, texel: { value: 1 / 512 }, focus: { value: 0.5 }, band: { value: 0.3 }, amount: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float texel; uniform float focus; uniform float band; uniform float amount;
      varying vec2 vUv;
      void main(){
        float d = abs(vUv.y - focus);
        float k = smoothstep(band, 0.5, d) * amount * texel * 2.2;
        vec2 dir = ${horizontal ? 'vec2(k, 0.0)' : 'vec2(0.0, k)'};
        vec4 s = texture2D(tDiffuse, vUv) * 0.1633;
        s += (texture2D(tDiffuse, vUv - dir) + texture2D(tDiffuse, vUv + dir)) * 0.1531;
        s += (texture2D(tDiffuse, vUv - 2.0*dir) + texture2D(tDiffuse, vUv + 2.0*dir)) * 0.12245;
        s += (texture2D(tDiffuse, vUv - 3.0*dir) + texture2D(tDiffuse, vUv + 3.0*dir)) * 0.0918;
        s += (texture2D(tDiffuse, vUv - 4.0*dir) + texture2D(tDiffuse, vUv + 4.0*dir)) * 0.051;
        gl_FragColor = s;
      }`,
  };
}

export function createPost(renderer, scene, camera, quality) {
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const size = renderer.getSize(new THREE.Vector2());

  const gtao = new GTAOPass(scene, camera, size.x, size.y);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 0.9;
  gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.5, scale: 1.1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  // GTAO's normal/depth pass only hides points and lines. Sprites, transparent surfaces (glass,
  // floor rings), and objects flagged userData.noAO would otherwise stamp dark AO halos.
  const baseHide = gtao._overrideVisibility.bind(gtao);
  gtao._overrideVisibility = function hideNonOpaque() {
    baseHide();
    const cache = this._visibilityCache;
    this.scene.traverse((o) => {
      if (!o.visible) return;
      const transparent = o.isMesh && [].concat(o.material).some((m) => m?.transparent);
      if (o.isSprite || transparent || o.userData.noAO) { o.visible = false; cache.push(o); }
    });
  };
  composer.addPass(gtao);
  const dbg = new URLSearchParams(location.search).get('ao');
  if (dbg === '1') gtao.output = GTAOPass.OUTPUT.AO;
  if (dbg === '2') gtao.output = GTAOPass.OUTPUT.Denoise;

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.5, 1.0);
  composer.addPass(bloom);

  const tiltH = new ShaderPass(tiltShader(true));
  const tiltV = new ShaderPass(tiltShader(false));
  composer.addPass(tiltH);
  composer.addPass(tiltV);

  composer.addPass(new OutputPass());

  const smaa = new SMAAPass();
  composer.addPass(smaa);
  const fxaa = new FXAAPass();
  composer.addPass(fxaa);

  let tiltOn = true;
  let q = quality;

  function apply() {
    gtao.enabled = q === 'high';
    bloom.enabled = q !== 'low';
    tiltH.enabled = tiltV.enabled = tiltOn && q !== 'low';
    smaa.enabled = q !== 'low';
    fxaa.enabled = q === 'low';
  }

  function setSize(w, h) {
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    const W = w * renderer.getPixelRatio(), H = h * renderer.getPixelRatio();
    tiltH.uniforms.texel.value = 1 / W;
    tiltV.uniforms.texel.value = 1 / H;
    bloom.setSize(W / 2, H / 2);
  }

  setSize(size.x, size.y);
  apply();

  return {
    composer, gtao, bloom, tiltH, tiltV,
    setQuality(nq) { q = nq; apply(); },
    setTiltShift(on) { tiltOn = on; apply(); },
    setSize,
    render(dt) { composer.render(dt); },
    dispose() { composer.dispose(); gtao.dispose?.(); bloom.dispose(); smaa.dispose?.(); },
  };
}
