// Each stage is a tile grid. Tile (0, 0) is the back corner where the two visible walls meet; x runs
// along the right-hand back wall, y along the left-hand one. The door is on the front edge (max y).
// blocked: tiles nothing can be placed on or walk through (a water heater, pillars).
// gate: what the company needs before it can move in (week: not before that week; the rest are minimums;
// orCash: from orCashWeek on, that much in the bank stands in for the MRR minimum).
export const OFFICE_STAGES = [
  { id: 'garage', name: 'Garage', rent: 300, upgradeCost: 0, grid: { w: 9, h: 7 }, door: { x: 4, y: 6 }, blocked: [[8, 0]] },
  { id: 'floor', name: 'Office Floor', rent: 3500, upgradeCost: 60000, gate: { week: 104, launches: 2, staff: 6, brand: 15, mrr: 250000, orCash: 450000, orCashWeek: 135 }, grid: { w: 15, h: 12 }, door: { x: 7, y: 11 }, blocked: [[5, 4], [9, 4], [5, 8], [9, 8]] },
  { id: 'hq', name: 'HQ Building', rent: 14000, upgradeCost: 750000, gate: { week: 260, liveProducts: 3, staff: 12, brand: 35, mrr: 500000 }, grid: { w: 21, h: 16 }, door: { x: 10, y: 15 }, blocked: [[6, 5], [14, 5], [6, 10], [14, 10]],
    // HQ expansion steps (state.office.expansion 1..3). Each only adds tiles at higher x or y, so placed
    // items keep their tiles. rent is added to the HQ rent; zones are regions with their own rules.
    expansions: [
      { step: 1, id: 'knock_through', name: 'Knock-through', upgradeCost: 2000000, rent: 6000, gate: { staff: 28 },
        grid: { w: 27, h: 16 }, door: { x: 10, y: 15 }, blocked: [[6, 5], [14, 5], [6, 10], [14, 10], [24, 5], [24, 10]], zones: [] },
      { step: 2, id: 'terrace', name: 'Roof Terrace', upgradeCost: 6000000, rent: 8000, gate: { week: 572, staff: 33 },
        grid: { w: 33, h: 16 }, door: { x: 10, y: 15 }, blocked: [[6, 5], [14, 5], [6, 10], [14, 10], [24, 5], [24, 10]],
        zones: [{ id: 'terrace', x0: 27, y0: 0, x1: 32, y1: 15 }] },
      { step: 3, id: 'annex', name: 'The Annex', upgradeCost: 15000000, rent: 12000, gate: { week: 728, staff: 38 },
        grid: { w: 33, h: 22 }, door: { x: 16, y: 21 }, blocked: [[6, 5], [14, 5], [6, 10], [14, 10], [24, 5], [24, 10], [8, 18], [16, 18], [24, 18]],
        zones: [{ id: 'terrace', x0: 27, y0: 0, x1: 32, y1: 15 }, { id: 'annex', x0: 0, y0: 16, x1: 32, y1: 21 }] },
    ] },
];

// The layout in use: a stage's grid, door, blocked tiles and zones, with HQ expansion steps applied.
export function officeShape(stage, expansion = 0) {
  const st = OFFICE_STAGES[stage];
  const ex = expansion > 0 ? st.expansions?.[expansion - 1] : null;
  return ex ? { grid: ex.grid, door: ex.door, blocked: ex.blocked, zones: ex.zones } : { grid: st.grid, door: st.door, blocked: st.blocked, zones: [] };
}
