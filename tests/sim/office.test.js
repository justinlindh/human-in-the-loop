import { describe, it, expect } from 'vitest';
import { createGame, dispatch, scoreRun } from '../../src/sim/index.js';
import { placementCheck, adjacencyPreview, footprintCells, seatTile, pathsClear, autoArrange, findSpot, deskCapacity, seatOf } from '../../src/sim/office.js';
import { itemBonus } from '../../src/sim/bonus.js';
import { eligibleEvents } from '../../src/sim/events.js';
import { createRng, int, pick } from '../../src/sim/rng.js';
import { B } from '../../src/sim/balance.js';
import { ITEMS } from '../../src/data/items.js';
import { OFFICE_STAGES } from '../../src/data/office.js';
import { ARCHETYPES } from '../../src/data/founders.js';
import { FUNDING } from '../../src/data/funding.js';
import { EVENTS } from '../../src/data/events.js';
import { classicGame, game, addStaff, addProduct, expectFail, addDesks, passOfficeGates } from './helpers.js';

const place = (s, itemId, x, y, rot = 0) => dispatch(s, { type: 'placeItem', itemId, x, y, rot });
const fresh = () => { const s = classicGame(); s.cash = 1e6; return s; };

describe('office data', () => {
  it('every item has a kind, a footprint, and prices; every stage a grid with a free door', () => {
    for (const it of Object.values(ITEMS)) {
      expect(['furniture', 'shop'], it.id).toContain(it.kind);
      expect(it.footprint.w >= 1 && it.footprint.h >= 1, it.id).toBe(true);
      expect(it.costs.length, it.id).toBe(it.kind === 'shop' ? 3 : 1);
      if (it.adjacency) expect(it.adjacency.radius >= 1 && Number.isFinite(it.adjacency.value), it.id).toBe(true);
    }
    for (const st of OFFICE_STAGES) {
      expect(st.door.y).toBe(st.grid.h - 1);
      expect(st.blocked.some(([x, y]) => x === st.door.x && y === st.door.y)).toBe(false);
    }
  });

  it('rotation maps the desk seat to +y, -x, -y, +x and swaps the box for rot 1 and 3', () => {
    expect(footprintCells('desk', 2, 2, 0)).toEqual([[2, 2], [2, 3]]);
    expect(seatTile({ itemId: 'desk', x: 2, y: 2, rot: 0 })).toEqual([2, 3]);
    expect(seatTile({ itemId: 'desk', x: 2, y: 2, rot: 1 })).toEqual([2, 2]);
    expect(footprintCells('desk', 2, 2, 1).sort()).toEqual([[2, 2], [3, 2]]);
    expect(seatTile({ itemId: 'desk', x: 2, y: 2, rot: 2 })).toEqual([2, 2]);
    expect(seatTile({ itemId: 'desk', x: 2, y: 2, rot: 3 })).toEqual([3, 2]);
    expect(footprintCells('meeting_table', 0, 0, 1).map(([x, y]) => [x, y]).reduce((m, [x, y]) => [Math.max(m[0], x), Math.max(m[1], y)], [0, 0])).toEqual([1, 2]);
  });
});

describe('placement', () => {
  it('the run starts with an empty garage', () => {
    const s = classicGame();
    expect(s.office).toEqual({ stage: 0, placed: [], expansion: 0 });
    expect(deskCapacity(s)).toBe(0);
  });

  it('refuses every invalid placement with a reason and state unchanged', () => {
    const s = fresh();
    expectFail(expect, dispatch, s, { type: 'placeItem', itemId: 'hot_tub', x: 0, y: 0, rot: 0 }, 'Unknown item');
    expectFail(expect, dispatch, s, { type: 'placeItem', itemId: 'desk', x: -1, y: 0, rot: 0 }, 'Out of bounds');
    expectFail(expect, dispatch, s, { type: 'placeItem', itemId: 'desk', x: 0, y: 6, rot: 0 }, 'Out of bounds');
    expectFail(expect, dispatch, s, { type: 'placeItem', itemId: 'desk', x: 1.5, y: 0, rot: 0 }, 'Out of bounds');
    expectFail(expect, dispatch, s, { type: 'placeItem', itemId: 'desk', x: 0, y: 0, rot: 7 }, 'Out of bounds');
    expectFail(expect, dispatch, s, { type: 'placeItem', itemId: 'desk', x: 8, y: 0, rot: 0 }, 'Blocked');
    expectFail(expect, dispatch, s, { type: 'placeItem', itemId: 'plant', x: 4, y: 6, rot: 0 }, 'Keep the door clear');
    expect(place(s, 'desk', 0, 0).ok).toBe(true);
    expectFail(expect, dispatch, s, { type: 'placeItem', itemId: 'plant', x: 0, y: 1, rot: 0 }, 'Overlaps something');
    expectFail(expect, dispatch, s, { type: 'placeItem', itemId: 'nap_pod', x: 3, y: 3, rot: 0 }, 'Needs a bigger office');
    expectFail(expect, dispatch, s, { type: 'placeItem', itemId: 'trophy_case', x: 3, y: 3, rot: 0 }, 'Needs an award first');
    s.cash = 100;
    expectFail(expect, dispatch, s, { type: 'placeItem', itemId: 'desk', x: 3, y: 0, rot: 0 }, 'Not enough cash');
  });

  it('a placement that walls a desk off from the door is refused', () => {
    const s = fresh();
    expect(place(s, 'desk', 0, 0).ok).toBe(true);
    // A row of plants across the room at y = 3 leaves only x = 8 open.
    for (let x = 0; x < 8; x++) expect(place(s, 'plant', x, 3).ok).toBe(true);
    expectFail(expect, dispatch, s, { type: 'placeItem', itemId: 'plant', x: 8, y: 3, rot: 0 }, 'Would block the path to a desk');
    // Boxing in the chair itself is refused too.
    const t = fresh();
    expect(place(t, 'desk', 0, 0).ok).toBe(true);
    expect(place(t, 'plant', 1, 1).ok).toBe(true);
    expectFail(expect, dispatch, t, { type: 'placeItem', itemId: 'plant', x: 0, y: 2, rot: 0 }, 'Would block the path to a desk');
  });

  it('a new desk must itself be reachable', () => {
    const s = fresh();
    expect(place(s, 'plant', 1, 0).ok).toBe(true);
    expect(place(s, 'plant', 1, 1).ok).toBe(true);
    expect(place(s, 'plant', 0, 2).ok).toBe(true);
    expectFail(expect, dispatch, s, { type: 'placeItem', itemId: 'desk', x: 0, y: 0, rot: 0 }, 'Would block the path to a desk');
  });

  it('placeItem charges the price and returns the id; moves are free and may overlap their own old spot', () => {
    const s = fresh();
    const res = place(s, 'desk', 2, 0);
    expect(res.ok).toBe(true);
    expect(s.cash).toBe(1e6 - ITEMS.desk.costs[0]);
    expect(s.office.placed).toEqual([{ id: res.id, itemId: 'desk', level: 1, x: 2, y: 0, rot: 0 }]);
    s.cash = 0;
    expect(dispatch(s, { type: 'moveItem', id: res.id, x: 2, y: 1, rot: 0 }).ok).toBe(true);
    expect(dispatch(s, { type: 'moveItem', id: res.id, x: 2, y: 1, rot: 1 }).ok).toBe(true);
    expect(s.office.placed[0]).toMatchObject({ x: 2, y: 1, rot: 1 });
    expect(s.cash).toBe(0);
    expectFail(expect, dispatch, s, { type: 'moveItem', id: 'nope', x: 0, y: 0, rot: 0 }, 'No such item');
    expectFail(expect, dispatch, s, { type: 'moveItem', id: res.id, x: 8, y: 0, rot: 0 }, 'Blocked');
  });

  it('placementCheck agrees with dispatch on hundreds of random attempts', () => {
    const r = createRng(42);
    const s = fresh();
    s.cash = 20000;
    const ids = ['desk', 'plant', 'whiteboard', 'coffee_corner', 'bookshelf', 'meeting_table', 'espresso', 'server_rack'];
    for (let i = 0; i < 400; i++) {
      const moving = s.office.placed.length && int(r, 0, 3) === 0 ? pick(r, s.office.placed) : null;
      const a = moving
        ? { type: 'moveItem', id: moving.id, x: int(r, -1, 9), y: int(r, -1, 7), rot: int(r, 0, 3) }
        : { type: 'placeItem', itemId: pick(r, ids), x: int(r, -1, 9), y: int(r, -1, 7), rot: int(r, 0, 3) };
      const check = placementCheck(s, a);
      const before = JSON.stringify(s);
      const res = dispatch(s, a);
      expect(res.ok, JSON.stringify(a)).toBe(check.ok);
      if (!res.ok) {
        expect(res.reason).toBe(check.reason);
        expect(JSON.stringify(s)).toBe(before);
      }
      expect(pathsClear(0, s.office.placed)).toBe(true);
    }
    expect(s.office.placed.length).toBeGreaterThan(5);
  });
});

describe('desks are capacity', () => {
  it('hiring needs a free desk; a desk someone sits at cannot be sold', () => {
    const s = fresh();
    expectFail(expect, dispatch, s, { type: 'hire', candidateId: s.candidates[0].id }, 'No free desk');
    addDesks(s, 2);
    expectFail(expect, dispatch, s, { type: 'hire', candidateId: s.candidates[0].id }, 'No free desk');
    const d = place(s, 'desk', 6, 0);
    expect(d.ok).toBe(true);
    expect(dispatch(s, { type: 'hire', candidateId: s.candidates[0].id }).ok).toBe(true);
    expect(deskCapacity(s)).toBe(3);
    expectFail(expect, dispatch, s, { type: 'sellItem', id: d.id }, 'Someone sits there');
    const e = place(s, 'desk', 7, 3);
    expect(e.ok).toBe(true);
    const cash = s.cash;
    expect(dispatch(s, { type: 'sellItem', id: e.id }).ok).toBe(true);
    expect(s.cash).toBe(cash + ITEMS.desk.costs[0] / 2);
  });

  it('placing the second desk completes the first goal right away', () => {
    const s = fresh();
    expect(place(s, 'desk', 0, 0).events.filter((e) => e.type === 'goal')).toEqual([]);
    expect(place(s, 'desk', 1, 0).events).toContainEqual({ type: 'goal', goalId: 'place_desks' });
  });

  it('seats are sticky: people keep their desk when others leave or desks move', () => {
    const s = fresh();
    addDesks(s, 4);
    const [a, b] = s.staff;
    expect(seatOf(s, a.id)).toEqual(seatTile(s.office.placed[0]));
    expect(seatOf(s, b.id)).toEqual(seatTile(s.office.placed[1]));
    expect(seatOf(s, 'nobody')).toBe(null);
    const c = addStaff(s, 'engineer', 'mid');
    const d = addStaff(s, 'engineer', 'mid');
    expect([c.deskId, d.deskId]).toEqual([s.office.placed[2].id, s.office.placed[3].id]);
    // c leaves: nobody else moves; the next hire takes c's old desk.
    s.staff = s.staff.filter((p) => p !== c);
    const e = addStaff(s, 'engineer', 'mid');
    expect([a.deskId, b.deskId, d.deskId]).toEqual(s.office.placed.slice(0, 4).filter((_, i) => i !== 2).map((x) => x.id));
    expect(e.deskId).toBe(s.office.placed[2].id);
    // Moving a desk keeps its sitter.
    const deskA = s.office.placed[0];
    const spot = suggestPlacementFor(s);
    expect(dispatch(s, { type: 'moveItem', id: deskA.id, ...spot }).ok).toBe(true);
    expect(a.deskId).toBe(deskA.id);
    expect(seatOf(s, a.id)).toEqual(seatTile(deskA));
    // Selling a spare desk moves nobody.
    s.cash = 1e6;
    const spare = dispatch(s, { type: 'placeItem', itemId: 'desk', ...findSpot(0, s.office.placed, 'desk') });
    const before = s.staff.map((p) => p.deskId);
    expect(dispatch(s, { type: 'sellItem', id: spare.id }).ok).toBe(true);
    expect(s.staff.map((p) => p.deskId)).toEqual(before);
  });

  it('the first desk seats a founder, and adjacency pays for seated desks', () => {
    const s = fresh();
    expect(s.staff.every((p) => p.deskId === null)).toBe(true);
    const d = place(s, 'desk', 0, 0);
    expect(s.staff[0].deskId).toBe(d.id);
    expect(s.staff[1].deskId).toBe(null);
    const preview = adjacencyPreview(s, { itemId: 'desk', x: 1, y: 0, rot: 0 });
    expect(preview.links).toEqual([]);
    expect(place(s, 'plant', 3, 1).ok).toBe(true);
    expect(adjacencyPreview(s, { itemId: 'desk', x: 2, y: 0, rot: 0 }).links[0].paid).toBe(true);
  });
});

function suggestPlacementFor(s) {
  return findSpot(0, s.office.placed, 'desk', [0]);
}

describe('adjacency', () => {
  it('a plant near a desk helps that desk, averaged over staff; far away it does nothing', () => {
    const s = fresh();
    expect(place(s, 'desk', 0, 0).ok).toBe(true);
    expect(place(s, 'desk', 6, 0).ok).toBe(true);
    const v = ITEMS.plant.adjacency.value;
    expect(place(s, 'plant', 1, 2).ok).toBe(true);
    expect(itemBonus(s, 'meaningRecovery')).toBeCloseTo(v / s.staff.length);
    expect(place(s, 'plant', 7, 2).ok).toBe(true);
    expect(itemBonus(s, 'meaningRecovery')).toBeCloseTo((2 * v) / s.staff.length);
    const t = fresh();
    expect(place(t, 'desk', 0, 0).ok).toBe(true);
    expect(place(t, 'plant', 5, 5).ok).toBe(true);
    expect(itemBonus(t, 'meaningRecovery')).toBe(0);
  });

  it('only occupied desks count', () => {
    const s = fresh();
    for (const x of [0, 1, 6, 7]) expect(place(s, 'desk', x, 0).ok).toBe(true);
    s.office.placed.push({ id: 'pl', itemId: 'plant', level: 1, x: 7, y: 3, rot: 0 });
    expect(itemBonus(s, 'meaningRecovery')).toBe(0);
    addStaff(s, 'engineer', 'mid');
    addStaff(s, 'engineer', 'mid');
    expect(itemBonus(s, 'meaningRecovery')).toBeCloseTo((2 * ITEMS.plant.adjacency.value) / 4);
  });

  it('racks next to racks add uptime on top of their own effect', () => {
    const s = fresh();
    expect(place(s, 'server_rack', 0, 0).ok).toBe(true);
    const alone = itemBonus(s, 'uptimeFloor');
    expect(alone).toBeCloseTo(ITEMS.server_rack.effects[0].uptimeFloor);
    expect(place(s, 'server_rack', 2, 0).ok).toBe(true);
    const pair = ITEMS.server_rack.effects[0].uptimeFloor * 1.5 + 2 * ITEMS.server_rack.adjacency.value;
    expect(itemBonus(s, 'uptimeFloor')).toBeCloseTo(pair);
  });

  it('the preview reports exactly the links itemBonus pays', () => {
    const s = fresh();
    for (const x of [0, 1, 6, 7]) expect(place(s, 'desk', x, 0).ok).toBe(true);
    const occupied = s.office.placed.slice(0, 2).map((d) => d.id);
    const empty = s.office.placed.slice(2).map((d) => d.id);
    const near01 = adjacencyPreview(s, { itemId: 'plant', x: 1, y: 3, rot: 0 }).links;
    expect(near01.map((l) => [l.targetId, l.paid]).sort()).toEqual(occupied.map((id) => [id, true]).sort());
    const near67 = adjacencyPreview(s, { itemId: 'plant', x: 7, y: 3, rot: 0 }).links;
    expect(near67.every((l) => !l.paid && empty.includes(l.targetId))).toBe(true);
    const before = itemBonus(s, 'meaningRecovery');
    expect(place(s, 'plant', 1, 3).ok).toBe(true);
    const paid = near01.filter((l) => l.paid).reduce((a, l) => a + l.value, 0);
    expect(itemBonus(s, 'meaningRecovery') - before).toBeCloseTo(paid / s.staff.length);
    // A desk placed next to the plant sees the link from its side; it is unpaid until someone sits there.
    const deskLinks = adjacencyPreview(s, { itemId: 'desk', x: 3, y: 2, rot: 0 }).links;
    expect(deskLinks).toEqual([expect.objectContaining({ target: 'desk', key: 'meaningRecovery', paid: false })]);
    // Moving the plant away shows no links.
    const plantId = s.office.placed.at(-1).id;
    expect(adjacencyPreview(s, { id: plantId, x: 4, y: 5, rot: 0 }).links).toEqual([]);
    const r = place(s, 'server_rack', 5, 2);
    expect(adjacencyPreview(s, { itemId: 'server_rack', x: 5, y: 3, rot: 0 }).links.map((l) => l.target)).toEqual(['item', 'item']);
    expect(r.ok).toBe(true);
  });

  it('previewing a move keeps the desk in its seat order, and effects are the real itemBonus change', () => {
    const s = fresh();
    for (const x of [0, 1, 6, 7]) expect(place(s, 'desk', x, 0).ok).toBe(true);
    expect(place(s, 'plant', 7, 3).ok).toBe(true);
    // Desk 0 is occupied; moving it next to the plant must still count as paid.
    const d0 = s.office.placed[0];
    const move = adjacencyPreview(s, { id: d0.id, x: 5, y: 3, rot: 0 });
    expect(move.links.every((l) => l.paid)).toBe(true);
    const before = itemBonus(s, 'meaningRecovery');
    expect(dispatch(s, { type: 'moveItem', id: d0.id, x: 5, y: 3, rot: 0 }).ok).toBe(true);
    expect(move.effects[0].delta).toBeCloseTo(itemBonus(s, 'meaningRecovery') - before);
    expect(move.text).toMatch(/^\+\d+(\.\d)?% meaning recovery for the team \(1 desk nearby\)$/);
  });

  it('a move that loses a bonus reports the loss, and shop effects read in words', () => {
    const s = fresh();
    for (const x of [0, 1]) expect(place(s, 'desk', x, 0).ok).toBe(true);
    const plant = place(s, 'plant', 1, 3);
    const before = itemBonus(s, 'meaningRecovery');
    expect(before).toBeGreaterThan(0);
    const away = adjacencyPreview(s, { id: plant.id, x: 8, y: 5, rot: 0 });
    expect(away.effects).toEqual([expect.objectContaining({ key: 'meaningRecovery', delta: expect.closeTo(-before, 6) })]);
    expect(away.text).toMatch(/^-\d+(\.\d)?% meaning recovery$/);
    expect(adjacencyPreview(s, { itemId: 'standing_desk', x: 4, y: 4, rot: 0 }).text).toBe('-10% stamina drain');
  });

  it('preview effects respect the cap', () => {
    const s = fresh();
    addDesks(s, 2);
    s.office.placed.push({ id: 'pw', itemId: 'plant_wall', level: 3, x: 0, y: 200, rot: 0 }, { id: 'pw2', itemId: 'plant_wall', level: 3, x: 0, y: 210, rot: 0 });
    expect(itemBonus(s, 'meaningRecovery')).toBeCloseTo(0.45);
    const [sx, sy] = seatTile(s.office.placed[0]);
    const p = adjacencyPreview(s, { itemId: 'plant', x: sx, y: sy + 1, rot: 0 });
    expect(p.effects[0].delta).toBeCloseTo(Math.min(0.5, 0.45 + (2 * ITEMS.plant.adjacency.value) / 2) - 0.45);
  });

  it('adjacency stacks with global effects and stays under the 50% cap', () => {
    const s = fresh();
    s.officeStage = 2;
    s.office.stage = 2;
    addDesks(s, 2);
    for (let i = 0; i < 40; i++) {
      const spot = findSpot(2, s.office.placed, 'plant');
      s.office.placed.push({ id: `p${i}`, itemId: 'plant', level: 1, ...spot });
    }
    s.office.placed.push({ id: 'pw', itemId: 'plant_wall', level: 3, x: 0, y: 200, rot: 0 }, { id: 'pw2', itemId: 'plant_wall', level: 3, x: 0, y: 210, rot: 0 });
    expect(itemBonus(s, 'meaningRecovery')).toBe(0.5);
  });
});

describe('moving offices', () => {
  const furnished = (seed) => {
    const s = game(seed);
    s.cash = 1e7;
    for (const id of ['plant', 'whiteboard', 'coffee_corner', 'espresso']) {
      const spot = findSpot(0, s.office.placed, id);
      if (spot) expect(dispatch(s, { type: 'placeItem', itemId: id, ...spot }).ok).toBe(true);
    }
    return s;
  };

  it('an upgrade re-packs every item validly into the new grid and keeps ids, levels, and desk order', () => {
    for (const seed of [1, 2, 3]) {
      const s = furnished(seed);
      passOfficeGates(s);
      const before = s.office.placed.map((p) => [p.id, p.itemId, p.level]);
      const deskIds = s.office.placed.filter((p) => p.itemId === 'desk').map((p) => p.id);
      expect(dispatch(s, { type: 'upgradeOffice' }).ok).toBe(true);
      expect(s.office.stage).toBe(1);
      expect(s.office.placed.map((p) => [p.id, p.itemId, p.level])).toEqual(before);
      expect(s.office.placed.filter((p) => p.itemId === 'desk').map((p) => p.id)).toEqual(deskIds);
      const cells = new Set();
      for (const p of s.office.placed) {
        const rest = s.office.placed.filter((q) => q !== p);
        expect(placementCheck({ ...s, cash: 1e9, office: { ...s.office, placed: rest } }, { itemId: p.itemId, x: p.x, y: p.y, rot: p.rot }).reason, p.id).toBe(null);
        for (const [x, y] of footprintCells(p.itemId, p.x, p.y, p.rot)) {
          expect(cells.has(`${x},${y}`)).toBe(false);
          cells.add(`${x},${y}`);
        }
      }
      expect(pathsClear(1, s.office.placed)).toBe(true);
      expect(dispatch(s, { type: 'upgradeOffice' }).ok).toBe(true);
      expect(pathsClear(2, s.office.placed)).toBe(true);
    }
  });

  it('auto-arrange is deterministic and packs a full garage worth of desks', () => {
    const s = fresh();
    addDesks(s, 8);
    const a = autoArrange(1, s.office.placed);
    const b = autoArrange(1, s.office.placed);
    expect(a).toEqual(b);
    expect(a.left).toEqual([]);
    expect(pathsClear(1, a.placed)).toBe(true);
  });
});

describe('founding', () => {
  it('founders come from their archetypes', () => {
    for (const [a, b] of [['hustler', 'seller'], ['operator', 'researcher'], ['designer', 'engineer']]) {
      const s = createGame({ seed: 4, founders: [a, b], funding: 'family', logoColor: '#123456', tagline: 'We do things' });
      expect(s.founding).toEqual({ founders: [a, b], funding: 'family', logoColor: '#123456', tagline: 'We do things' });
      expect(s.staff.map((p) => p.role)).toEqual([ARCHETYPES[a].role, ARCHETYPES[b].role]);
      expect(s.staff.map((p) => p.traits)).toEqual([[ARCHETYPES[a].trait], [ARCHETYPES[b].trait]]);
      expect(s.staff.every((p) => p.founder && p.archetype)).toBe(true);
      expect(s.cash).toBe(B.funding.family.cash);
    }
  });

  it('bad founder requests fall back to the default pair; unknown funding to bootstrapped', () => {
    for (const founders of [['engineer', 'engineer'], ['wizard', 'designer'], ['engineer'], 'x']) {
      const s = createGame({ seed: 1, founders, funding: 'lottery' });
      expect(s.founding.founders).toEqual(['engineer', 'designer']);
      expect(s.founding.funding).toBe('bootstrapped');
    }
  });

  it('founders hold know-how whatever their role: a no-builder pair stays above the collapse line in year 1', async () => {
    const { runBot } = await import('../../src/sim/bots.js');
    for (const seed of [1, 2, 3]) {
      let low = 100;
      runBot('sensible', seed, 52, { founding: { founders: ['hustler', 'seller'] }, onWeek: (st) => { low = Math.min(low, st.institutionalKnowledge); } });
      expect(low, `seed ${seed}`).toBeGreaterThan(B.collapseIkBelow);
    }
  });

  it('funding sets cash and the score multiplier', () => {
    const scores = {};
    for (const f of Object.keys(FUNDING)) {
      const s = createGame({ seed: 2, funding: f });
      expect(s.cash).toBe(B.funding[f].cash);
      s.cash = 1e6;
      s.brand = 50;
      scores[f] = scoreRun(s).score;
    }
    expect(scores.family).toBe(Math.round(scores.bootstrapped * B.funding.family.scoreMult));
    expect(scores.preseed).toBe(Math.round(scores.bootstrapped * B.funding.preseed.scoreMult));
    const pre = createGame({ seed: 2, funding: 'preseed' });
    expect(pre.brand).toBe(B.startBrand + B.funding.preseed.brand);
    expect(pre.candidates.filter((c) => c.seniority === 'senior').length).toBeGreaterThanOrEqual(B.funding.preseed.seniorCandidates);
  });

  it('funding events only reach companies funded that way', () => {
    const funded = Object.values(EVENTS).filter((e) => e.funding);
    expect(funded.filter((e) => e.funding === 'family').length).toBeGreaterThanOrEqual(2);
    expect(funded.filter((e) => e.funding === 'preseed').length).toBeGreaterThanOrEqual(2);
    for (const f of Object.keys(FUNDING)) {
      const s = openEverythingWith(f);
      const ids = eligibleEvents(s).map((e) => e.id);
      for (const e of funded) if (ids.includes(e.id)) expect(e.funding, e.id).toBe(f);
      if (f !== 'bootstrapped') expect(ids.some((id) => EVENTS[id].funding === f), f).toBe(true);
    }
  });
});

function openEverythingWith(funding) {
  const s = createGame({ seed: 3, funding });
  s.era = { id: 'agents', since: 0 };
  s.week = 60;
  s.stats.launches = 2;
  addProduct(s);
  for (let i = 0; i < 6; i++) addStaff(s, 'engineer', 'mid');
  return s;
}

describe('suggested layout', () => {
  it('desks go into facing islands with aisles, and every suggestion is valid', async () => {
    const { suggestPlacement } = await import('../../src/sim/office.js');
    for (const stage of [0, 1, 2]) {
      const s = fresh();
      s.officeStage = stage;
      s.office.stage = stage;
      s.cash = 1e9;
      const want = [6, 12, 30][stage];
      for (let i = 0; i < want; i++) {
        const spot = suggestPlacement(s, 'desk');
        expect(spot, `stage ${stage} desk ${i}`).not.toBe(null);
        expect(dispatch(s, { type: 'placeItem', itemId: 'desk', ...spot }).ok).toBe(true);
      }
      const desks = s.office.placed;
      // Islands: desks face each other in pairs, so both rot 0 and rot 2 appear, and rows are spread out.
      expect(new Set(desks.map((d) => d.rot))).toEqual(new Set([0, 2]));
      if (stage > 0) expect(new Set(desks.map((d) => d.y)).size).toBeGreaterThanOrEqual(2);
      expect(Math.max(...desks.map((d) => d.x))).toBeLessThan(OFFICE_STAGES[stage].grid.w - 1);
      for (const id of ['plant', 'coffee_corner', 'whiteboard', 'bookshelf', 'espresso']) {
        const spot = suggestPlacement(s, id);
        if (spot) expect(placementCheck(s, { itemId: id, ...spot }).ok, id).toBe(true);
      }
    }
  });

  it('a suggested plant lands next to occupied desks', async () => {
    const { suggestPlacement } = await import('../../src/sim/office.js');
    const s = fresh();
    for (let i = 0; i < 2; i++) dispatch(s, { type: 'placeItem', itemId: 'desk', ...suggestPlacement(s, 'desk') });
    const spot = suggestPlacement(s, 'plant');
    expect(adjacencyPreview(s, { itemId: 'plant', ...spot }).links.filter((l) => l.paid).length).toBe(2);
  });
});
