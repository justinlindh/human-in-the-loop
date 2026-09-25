// Public surface of the simulation. Importing a system module registers it.
import './systems.js';

export { createGame, FUNCTIONS, SAVE_VERSION } from './state.js';
export { tick } from './tick.js';
export { dispatch } from './actions.js';
export { dateOf } from './util.js';
export { policyCost, weeklyCosts } from './economy.js';
export { productAppeal, totalMrr, officeGateReason } from './products.js';
export { oversightRequired, oversightProvided } from './automation.js';
export { categoryLeaders } from './market.js';
export { securityPosture } from './incidents.js';
export { scoreRun, retireVia, retireOptions, ipoBlocker } from './endgame.js';
export { placementCheck, suggestPlacement, adjacencyPreview, footprintCells, seatTile, seatOf, deskCapacity, deskCap, nextExpansion } from './office.js';
export { stageIncentive } from './incentives.js';
export { postOptions } from './posts.js';
