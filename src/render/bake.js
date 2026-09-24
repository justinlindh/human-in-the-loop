import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Character part baking: the rigid parts under one animated pivot become a single mesh drawn with
// one material. Each vertex carries its source material's colour, roughness, metalness, and
// whether the mood tint applies to it, so the result shades the same as the separate parts.

const LUMA = 'vec3(0.2126, 0.7152, 0.0722)';

// One material per character (it holds that character's tint); every one shares a shader program.
export function bakedMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, metalness: 0 });
  m.userData.tint = { value: 0 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTint = m.userData.tint;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aSurf;\nvarying vec3 vSurf;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = aSurf;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurf;\nuniform float uTint;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, ${LUMA})) * 0.92, uTint * vSurf.z);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vSurf.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vSurf.y;');
  };
  m.customProgramCacheKey = () => 'hitl-baked-character';
  return m;
}

// Merges the meshes under `nodes` into one mesh in `into`'s space. `tintable(material)` says which
// source materials follow the mood tint. The source meshes are detached. Returns the new mesh.
export function bakeParts(nodes, into, material, tintable) {
  into.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(into.matrixWorld).invert();
  const geos = [];
  let cast = false;
  let noAO = true;
  const sources = [];
  for (const n of nodes) {
    n.updateMatrixWorld(true);
    n.traverse((o) => { if (o.isMesh && o.visible !== false) sources.push(o); });
  }
  for (const o of sources) {
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const surf = new Float32Array(n * 3);
    const c = mat.color ?? new THREE.Color(1, 1, 1);
    const t = tintable(mat) ? 1 : 0;
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      surf[i * 3] = mat.roughness ?? 0.8; surf[i * 3 + 1] = mat.metalness ?? 0; surf[i * 3 + 2] = t;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSurf', new THREE.BufferAttribute(surf, 3));
    geos.push(g);
    cast ||= o.castShadow;
    noAO &&= !!o.userData.noAO;
  }
  for (const n of nodes) n.removeFromParent();
  if (!geos.length) return null;
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  mesh.userData.cast = cast;
  if (noAO) mesh.userData.noAO = true;
  mesh.name = 'baked';
  into.add(mesh);
  return mesh;
}
