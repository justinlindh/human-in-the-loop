// Public surface of the simulation. Importing a system module registers it.
import './staff.js';
import './work.js';
import './projects.js';
import './products.js';
import './economy.js';

export { createGame, FUNCTIONS, SAVE_VERSION } from './state.js';
export { tick } from './tick.js';
export { dispatch } from './actions.js';
export { dateOf } from './util.js';
export { productAppeal, totalMrr } from './products.js';
