// Optional sim helpers, found by name across src/sim so the UI builds whether or not a given
// helper exists yet. Each export is a function or null; callers keep a local fallback.
const MODS = Object.values(import.meta.glob('../sim/*.js', { eager: true }));
const find = (name) => MODS.map((m) => m[name]).find((f) => typeof f === 'function') ?? null;

export const SIMX = {
  placementCheck: find('placementCheck'),
  adjacencyPreview: find('adjacencyPreview'),
  retireOptions: find('retireOptions'),
  suggestPlacement: find('suggestPlacement'),
  officeGateReason: find('officeGateReason'),
  expansionCost: find('expansionCost'),
  deskCap: find('deskCap'),
  nextExpansion: find('nextExpansion'),
  policyCost: find('policyCost'),
  deskCapacity: find('deskCapacity'),
  isUnlocked: find('isUnlocked'),
  lockedReason: find('lockedReason'),
  automationCap: find('automationCap'),
  retireVia: find('retireVia'),
  ipoBlocker: find('ipoBlocker'),
  acquisitionOpen: find('acquisitionOpen'),
};

export function call(name, ...args) {
  const f = SIMX[name];
  if (!f) return undefined;
  try { return f(...args); } catch { return undefined; }
}
