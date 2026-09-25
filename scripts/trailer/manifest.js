// The capture manifest for the trailer: the review items its beats name, with the beat's overrides.
// Item ids are prefixed `trailer-<beat>` so their files never collide with review captures.
// A beat's `camera` list adds zooms ({ at, zoom } multiplies the current zoom, eased by the camera
// rig) and its `actions` list adds page JS, both on the clip's own clock.
import { ITEMS } from '../capture-manifest.js';
import { BEATS } from './config.js';

const byId = new Map(ITEMS.map((it) => [it.id, it]));

// The camera rig zooms by exp(-deltaY * 0.0015) per wheel event.
const ZOOM = (factor) => `document.getElementById('scene').dispatchEvent(new WheelEvent('wheel', { deltaY: ${(-Math.log(factor) / 0.0015).toFixed(1)}, cancelable: true }))`;

const items = BEATS.filter((b) => b.item).map((b) => {
  const base = byId.get(b.item);
  if (!base) throw new Error(`trailer: beat ${b.id} names unknown capture item ${b.item}`);
  const { group, ...rest } = base;
  const item = { ...rest, ...b.capture, id: `trailer-${b.id}`, title: `Trailer: ${b.id} (${base.title})` };
  const extra = [...(b.camera ?? []).map((c) => ({ at: c.at, js: ZOOM(c.zoom) })), ...(b.actions ?? [])];
  if (extra.length) item.actions = [...(item.actions ?? []), ...extra];
  return item;
});

export { items as ITEMS };
