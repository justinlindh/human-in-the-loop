// Desk layout belongs to the renderer; size is the floor footprint in world units.
export const OFFICE_STAGES = [
  { id: 'garage', name: 'Garage', capacity: 4, rent: 300, upgradeCost: 0, itemSlots: 3, size: [10, 8] },
  { id: 'floor', name: 'Office Floor', capacity: 12, rent: 3500, upgradeCost: 60000, itemSlots: 8, size: [18, 14] },
  { id: 'hq', name: 'HQ Building', capacity: 30, rent: 14000, upgradeCost: 400000, itemSlots: 16, size: [28, 22] },
];
