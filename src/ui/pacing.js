// The pacing switches (B.pacing in the balance table). Each part of the quieter interface follows its
// own boolean; until the block exists, or when a key is false or missing, the interface is the ordinary one.
import { B } from '../sim/balance.js';

export const pacingOn = (key) => B.pacing?.[key] === true;
