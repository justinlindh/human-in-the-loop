// Public surface of the simulation. Importing a system module registers it.
import './systems.js';

export { createGame, FUNCTIONS, SAVE_VERSION } from './state.js';
export { tick } from './tick.js';
export { dispatch } from './actions.js';
export { dateOf } from './util.js';
export { productAppeal, totalMrr } from './products.js';
export { oversightRequired, oversightProvided } from './automation.js';
export { categoryLeaders } from './market.js';
export { securityPosture } from './incidents.js';
export { scoreRun, retireVia, retireOptions, ipoBlocker } from './endgame.js';
export { placementCheck, suggestPlacement, adjacencyPreview, footprintCells, seatTile, seatOf, deskCapacity } from './office.js';
