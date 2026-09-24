// Placement helpers for build mode: footprints, the validity check, and adjacency previews.
// The sim's own check wins when src/sim exports one; the local check mirrors the contract's rules
// so the ghost preview works before it does. The sim still has the final say on dispatch.
import { CATALOG, stageGrid, isDesk } from './v2content.js';
import { SIMX } from './simapi.js';

const simCheck = SIMX.placementCheck;

export const placedOf = (s) => s.office?.placed ?? [];
export const stageOf = (s) => s.office?.stage ?? s.officeStage ?? 0;

export function footprint(itemId, rot = 0) {
  const f = CATALOG[itemId]?.footprint ?? { w: 1, h: 1 };
  return rot % 2 ? { w: f.h, h: f.w } : { w: f.w, h: f.h };
}

export function rectOf(p) {
  const f = footprint(p.itemId, p.rot ?? 0);
  return { x: p.x, y: p.y, w: f.w, h: f.h };
}

const rectDist = (a, b) => Math.max(0, a.x - (b.x + b.w - 1), b.x - (a.x + a.w - 1), a.y - (b.y + b.h - 1), b.y - (a.y + a.h - 1));

export function itemAt(s, x, y) {
  return placedOf(s).find((p) => { const r = rectOf(p); return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h; }) ?? null;
}

// { ok, reason } for putting itemId at (x, y, rot). moveId: the placed item being moved (ignored for overlap, free of charge).
export function checkPlace(s, { itemId, x, y, rot = 0, moveId = null }) {
  if (simCheck) {
    try {
      const r = simCheck(s, { itemId, x, y, rot, id: moveId ?? undefined });
      if (r && typeof r.ok === 'boolean') return r;
    } catch { /* fall through to the local check */ }
  }
  const it = CATALOG[itemId];
  if (!it) return { ok: false, reason: 'Unknown item' };
  if (!moveId && (s.cash ?? 0) < (it.costs?.[0] ?? 0)) return { ok: false, reason: 'Not enough cash' };
  const g = stageGrid(stageOf(s));
  const r = { x, y, ...footprint(itemId, rot) };
  if (x < 0 || y < 0 || x + r.w > g.w || y + r.h > g.h) return { ok: false, reason: 'Out of bounds' };
  const occ = new Uint8Array(g.w * g.h);
  const mark = (q) => { for (let i = q.x; i < q.x + q.w; i++) for (let j = q.y; j < q.y + q.h; j++) if (i >= 0 && j >= 0 && i < g.w && j < g.h) occ[j * g.w + i] = 1; };
  for (const [bx, by] of g.blocked) occ[by * g.w + bx] = 2;
  const others = placedOf(s).filter((p) => p.id !== moveId);
  for (const p of others) mark(rectOf(p));
  for (let i = r.x; i < r.x + r.w; i++) for (let j = r.y; j < r.y + r.h; j++) if (occ[j * g.w + i]) return { ok: false, reason: 'Blocked' };
  if (g.door.x >= r.x && g.door.x < r.x + r.w && g.door.y >= r.y && g.door.y < r.y + r.h) return { ok: false, reason: 'Blocked' };
  mark(r);
  // Every desk needs a free tile beside it that the door can reach.
  const seen = new Uint8Array(g.w * g.h);
  const q = [g.door.y * g.w + g.door.x];
  seen[q[0]] = 1;
  while (q.length) {
    const k = q.pop();
    const cx = k % g.w, cy = (k - cx) / g.w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
      const n = ny * g.w + nx;
      if (seen[n] || occ[n]) continue;
      seen[n] = 1; q.push(n);
    }
  }
  const desks = [...others.filter((p) => isDesk(p.itemId)).map(rectOf), ...(isDesk(itemId) ? [r] : [])];
  for (const d of desks) {
    let reach = false;
    for (let i = d.x - 1; i <= d.x + d.w && !reach; i++) for (let j = d.y - 1; j <= d.y + d.h && !reach; j++) {
      const edge = (i === d.x - 1 || i === d.x + d.w) !== (j === d.y - 1 || j === d.y + d.h);
      if (edge && i >= 0 && j >= 0 && i < g.w && j < g.h && seen[j * g.w + i]) reach = true;
    }
    if (!reach) return { ok: false, reason: 'Would block the path to a desk' };
  }
  return { ok: true };
}

// Which placed things an item at (x, y, rot) would boost, and which boosts a new desk there would receive.
// { gives: { key, value, count, empty, to, ids, radius } | null, receives: [{ itemId, key, value }] }.
// The sim's link list is the source of truth; the local measure is only a fallback.
export function adjacencyPreview(s, { itemId, x, y, rot = 0, moveId = null }) {
  if (SIMX.adjacencyPreview) {
    try {
      const r = SIMX.adjacencyPreview(s, { itemId, x, y, rot, id: moveId ?? undefined });
      // Either a bare link list, or { links, effects, text } where text is the real payout.
      if (Array.isArray(r)) return fromLinks(s, itemId, r, moveId ?? 'preview');
      if (r && Array.isArray(r.links)) {
        const out = fromLinks(s, itemId, r.links, moveId ?? 'preview');
        if (typeof r.text === 'string') out.texts = r.text ? [r.text] : [];
        return out;
      }
    } catch { /* fall back to the local measure */ }
  }
  const r = { x, y, ...footprint(itemId, rot) };
  const others = placedOf(s).filter((p) => p.id !== moveId);
  const out = { gives: null, receives: [] };
  const adj = CATALOG[itemId]?.adjacency;
  if (adj) {
    const targets = others.filter((p) => (adj.to ? p.itemId === adj.to || p.itemId === itemId : isDesk(p.itemId)) && rectDist(rectOf(p), r) <= adj.radius);
    out.gives = { key: adj.key, value: adj.value, count: targets.length, to: adj.to ? CATALOG[adj.to]?.name ?? adj.to : 'desk', ids: targets.map((p) => p.id), radius: adj.radius };
  }
  if (isDesk(itemId)) {
    for (const p of others) {
      const a = CATALOG[p.itemId]?.adjacency;
      if (a && !a.to && rectDist(rectOf(p), r) <= a.radius) out.receives.push({ itemId: p.itemId, key: a.key, value: a.value });
    }
  }
  return out;
}

// The first valid spot: the sim's layout suggestion when it has one, else a scan from the back corner.
export function firstFit(s, itemId, rot = 0) {
  if (SIMX.suggestPlacement) {
    try {
      const spot = SIMX.suggestPlacement(s, itemId);
      if (spot && checkPlace(s, { itemId, ...spot }).ok) return spot;
    } catch { /* scan instead */ }
  }
  const g = stageGrid(stageOf(s));
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    if (checkPlace(s, { itemId, x, y, rot }).ok) return { x, y, rot };
  }
  return null;
}

function fromLinks(s, itemId, links, candId) {
  const byId = new Map(placedOf(s).map((p) => [p.id, p]));
  const adj = CATALOG[itemId]?.adjacency;
  const out = { gives: null, receives: [], texts: [] };
  // When the sim supplies display text for a link (the real, clamped delta), it is shown verbatim.
  for (const l of links) if (typeof l.text === 'string' && l.text && !out.texts.includes(l.text)) out.texts.push(l.text);
  const given = links.filter((l) => l.sourceId === candId);
  if (adj || given.length) {
    const ids = [...new Set(given.map((l) => l.targetId))];
    const first = given[0];
    const toItem = first?.target === 'item' ? byId.get(first.targetId)?.itemId : adj?.to;
    out.gives = {
      key: first?.key ?? adj?.key, value: first?.value ?? adj?.value, count: ids.length,
      empty: new Set(given.filter((l) => l.paid === false).map((l) => l.targetId)).size,
      to: toItem ? CATALOG[toItem]?.name ?? toItem : 'desk', ids, radius: adj?.radius ?? 1,
    };
  }
  for (const l of links) {
    if (l.targetId !== candId) continue;
    out.receives.push({ itemId: byId.get(l.sourceId)?.itemId ?? null, key: l.key, value: l.value });
  }
  return out;
}
