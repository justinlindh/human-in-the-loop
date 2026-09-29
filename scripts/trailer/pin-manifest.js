// Capture items that play each pin's source game and hand its state to the index (see pin.mjs).
import { PIN_SOURCES } from './config.js';
import { DUMP_STATE } from './pins.js';

export const ITEMS = Object.entries(PIN_SOURCES).filter(([, src]) => src.setup).map(([name, src]) => ({
  id: `pin-${name}`, title: `Trailer pin: ${name}`, query: src.query, still: true, seconds: 0.4, warmup: 0.2,
  setup: src.setup, actions: [{ at: 0.1, js: DUMP_STATE }],
}));
