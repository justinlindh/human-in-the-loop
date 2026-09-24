import { h } from '../dom.js';
import { MENU } from '../menu.js';

const stub = (label) => ({
  build: () => ({ el: h('div.empty', { text: `${label} is on its way.` }) }),
});

export const PANELS = Object.fromEntries(MENU.map((m) => [m.id, stub(m.label)]));
