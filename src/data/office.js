// Each stage is a tile grid. Tile (0, 0) is the back corner where the two visible walls meet; x runs
// along the right-hand back wall, y along the left-hand one. The door is on the front edge (max y).
// blocked: tiles nothing can be placed on or walk through (a water heater, pillars).
export const OFFICE_STAGES = [
  { id: 'garage', name: 'Garage', rent: 300, upgradeCost: 0, grid: { w: 9, h: 7 }, door: { x: 4, y: 6 }, blocked: [[8, 0]] },
  { id: 'floor', name: 'Office Floor', rent: 3500, upgradeCost: 60000, grid: { w: 15, h: 12 }, door: { x: 7, y: 11 }, blocked: [[5, 4], [9, 4], [5, 8], [9, 8]] },
  { id: 'hq', name: 'HQ Building', rent: 14000, upgradeCost: 400000, grid: { w: 21, h: 16 }, door: { x: 10, y: 15 }, blocked: [[6, 5], [14, 5], [6, 10], [14, 10]] },
];
