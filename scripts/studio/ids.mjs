// Ids the scene records carry. An owner id is semantic (item:<placed id>, person:<staff id>, ...); a part id
// is the owner's id plus the mesh's path below the owner's root, so it does not move when another object is
// added, removed or reordered elsewhere in the scene, and it does not depend on how many meshes came before.
// A path segment is the node's part or name (its type when unnamed) and its index among siblings of the same name.

const label = (node) => node.userData?.part || node.name || node.type;
const segment = (node) => {
  const l = label(node);
  const same = node.parent.children.filter((c) => label(c) === l);
  return `${l}:${same.indexOf(node)}`;
};

// The path from `root` (excluded) down to `node`; '' for the root itself.
export function pathBelow(node, root) {
  const parts = [];
  for (let n = node; n && n !== root; n = n.parent) parts.push(segment(n));
  return parts.reverse().join('/');
}

// The whole path from the scene root, for geometry no owner claims.
export function pathOf(node) {
  if (!node.parent) return 'scene';
  return `${pathOf(node.parent)}/${segment(node)}`;
}

// An owner that is one mesh has it as its only part, named `self`, so no part id equals an owner id.
export const partId = (ownerId, mesh, root) => `${ownerId}/${pathBelow(mesh, root) || 'self'}`;

// What a carried object is called, wherever it is parented: its prop id, else its name.
export const heldName = (obj) => obj.userData?.propId ?? (obj.name || obj.type);
