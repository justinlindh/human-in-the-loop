import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/sim/index.js';
import { frontCells, footprintCells, placementCheck, findSpot, layoutOf } from '../../src/sim/office.js';
import { ITEMS } from '../../src/data/items.js';
import { game, passOfficeGates } from './helpers.js';

const REASON = 'Needs clear floor in front';

// The Office Floor with nothing placed and money to spend, so every tile is open.
function floor(seed = 1) {
  const s = passOfficeGates(game(seed));
  s.cash = 1e8;
  dispatch(s, { type: 'upgradeOffice' });
  s.office.placed = [];
  s.staff = s.staff.slice(0, 0);
  return s;
}
const place = (s, itemId, x, y, rot = 0) => dispatch(s, { type: 'placeItem', itemId, x, y, rot });

describe('issue #470: items with a front zone keep the tile in front of them clear', () => {
  it('the front row follows the rotation, across the rotated width', () => {
    expect(frontCells('espresso', 3, 3, 0)).toEqual([[3, 4], [4, 4]]);
    expect(frontCells('espresso', 3, 3, 1)).toEqual([[2, 3], [2, 4]]);
    expect(frontCells('espresso', 3, 3, 2)).toEqual([[3, 2], [4, 2]]);
    expect(frontCells('espresso', 3, 3, 3)).toEqual([[4, 3], [4, 4]]);
  });

  it('the zone starts at the level the item gains its front piece', () => {
    expect(frontCells('standing_desk', 3, 3, 0, 1)).toEqual([]);
    expect(frontCells('standing_desk', 3, 3, 0, 2)).toHaveLength(2);
    expect(frontCells('server_rack', 3, 3, 0, 2)).toEqual([]);
    expect(frontCells('server_rack', 3, 3, 0, 3)).toHaveLength(2);
    for (const id of ['espresso', 'coffee_corner', 'plant_wall', 'bookshelf', 'library', 'arcade']) expect(frontCells(id, 3, 3, 0, 1).length, id).toBeGreaterThan(0);
    expect(frontCells('desk', 3, 3, 0, 1)).toEqual([]);
    expect(frontCells('plant', 3, 3, 0, 1)).toEqual([]);
  });

  it('nothing may be placed on a front zone, and an item with one needs its front floor clear', () => {
    const s = floor(1);
    expect(place(s, 'espresso', 3, 3, 0).ok).toBe(true);
    expect(placementCheck(s, { itemId: 'plant', x: 3, y: 4 })).toEqual({ ok: false, reason: REASON });
    expect(placementCheck(s, { itemId: 'plant', x: 6, y: 5 }).ok).toBe(true);
    expect(place(s, 'plant', 6, 5).ok).toBe(true);
    // A coffee corner facing the plant is refused; turned away from it, it fits.
    expect(placementCheck(s, { itemId: 'coffee_corner', x: 6, y: 4, rot: 0 }).reason).toBe(REASON);
    expect(placementCheck(s, { itemId: 'coffee_corner', x: 6, y: 3, rot: 2 }).ok).toBe(true);
  });

  it('an item cannot face a wall', () => {
    const s = floor(2);
    const { w, h } = ITEMS.espresso.footprint;
    expect(placementCheck(s, { itemId: 'espresso', x: 3, y: 0, rot: 2 }).reason).toBe(REASON);
    expect(placementCheck(s, { itemId: 'espresso', x: 3, y: 0, rot: 0 }).ok).toBe(true);
    expect(w * h).toBe(2);
  });

  it('moving keeps the item\'s level: a level 3 rack needs its grate clear, a level 1 rack does not', () => {
    const s = floor(3);
    expect(place(s, 'server_rack', 3, 3, 0).ok).toBe(true);
    expect(place(s, 'plant', 3, 5).ok).toBe(true);
    const rack = s.office.placed.find((p) => p.itemId === 'server_rack');
    expect(placementCheck(s, { id: rack.id, x: 3, y: 4, rot: 0 }).ok).toBe(true);
    rack.level = 3;
    expect(placementCheck(s, { id: rack.id, x: 3, y: 4, rot: 0 }).reason).toBe(REASON);
  });

  it('an upgrade that brings a front zone needs that floor clear', () => {
    const s = floor(4);
    expect(place(s, 'standing_desk', 3, 3, 0).ok).toBe(true);
    expect(place(s, 'plant', 4, 4).ok).toBe(true);
    const desk = s.office.placed.find((p) => p.itemId === 'standing_desk');
    expect(dispatch(s, { type: 'upgradeItem', id: desk.id }).reason).toBe(REASON);
    const plant = s.office.placed.find((p) => p.itemId === 'plant');
    expect(dispatch(s, { type: 'moveItem', id: plant.id, x: 7, y: 7 }).ok).toBe(true);
    expect(dispatch(s, { type: 'upgradeItem', id: desk.id }).ok).toBe(true);
    expect(desk.level).toBe(2);
  });

  it('automatic placement finds spots that respect front zones', () => {
    const s = floor(5);
    for (const id of ['espresso', 'coffee_corner', 'bookshelf', 'plant_wall']) {
      const spot = findSpot(layoutOf(s), s.office.placed, id);
      expect(spot, id).toBeTruthy();
      expect(place(s, id, spot.x, spot.y, spot.rot).ok, id).toBe(true);
    }
    for (const p of s.office.placed) {
      const zone = new Set(frontCells(p.itemId, p.x, p.y, p.rot, p.level).map(String));
      expect(zone.size, p.itemId).toBeGreaterThan(0);
      for (const q of s.office.placed.filter((x) => x !== p)) {
        for (const c of footprintCells(q.itemId, q.x, q.y, q.rot)) expect(zone.has(String(c)), `${q.itemId} on ${p.itemId}'s front`).toBe(false);
      }
    }
  });
});
