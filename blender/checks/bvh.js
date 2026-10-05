// three-mesh-bvh for harness pages, by its package name, so Vite serves its pre-bundled copy with
// three.js resolved (a path into node_modules is served untransformed when node_modules is a link).
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';

export * from 'three-mesh-bvh';

// The harness pages' __fastRaycast, in a browser page and on the studio engine: raycasts on static
// meshes go through a per-mesh tree, built on the first raycast that reaches the mesh. Skinned,
// instanced and morphing meshes, and small ones, keep three's own test; hits are the same either way.
// `tool(fn)` runs fn on the tool random stream (a tree makes three.js objects, which take UUIDs from
// Math.random), so the game's stream is untouched.
export function patchRaycast(THREE, tool) {
  const slow = THREE.Mesh.prototype.raycast;
  const sphere = new THREE.Sphere();
  THREE.Mesh.prototype.raycast = function (raycaster, hits) {
    const geo = this.geometry;
    if (this.isSkinnedMesh || this.isInstancedMesh || this.morphTargetInfluences || !geo?.attributes?.position || geo.morphAttributes?.position) return slow.call(this, raycaster, hits);
    // three's own early outs, which acceleratedRaycast skips: a ray that misses the bounding sphere
    // would still invert the mesh's matrix and walk its tree.
    if (this.material === undefined) return;
    if (geo.boundingSphere === null) geo.computeBoundingSphere();
    if (!raycaster.ray.intersectsSphere(sphere.copy(geo.boundingSphere).applyMatrix4(this.matrixWorld))) return;
    if (!geo.boundsTree) {
      if ((geo.index ? geo.index.count : geo.attributes.position.count) / 3 < 64) return slow.call(this, raycaster, hits);
      tool(() => { geo.boundsTree = new MeshBVH(geo, { indirect: true }); });
    }
    return acceleratedRaycast.call(this, raycaster, hits);
  };
}
