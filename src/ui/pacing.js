// The pacing switches (B.pacing in the balance table). Each part of the quieter interface follows its
// own boolean; until the block exists, or when a part is turned off, the interface is the ordinary one.
import { B } from '../sim/balance.js';

export const pacingOn = (key) => !!B.pacing && B.pacing[key] !== false;
