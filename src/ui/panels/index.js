import { h } from '../dom.js';
import { MENU } from '../menu.js';
import { buildPanel } from './build.js';
import { staffPanel } from './staff.js';

const stub = (label) => ({
  build: () => ({ el: h('div.empty', { text: `${label} is on its way.` }) }),
});

export const PANELS = {
  ...Object.fromEntries(MENU.map((m) => [m.id, stub(m.label)])),
  build: { title: 'Build', wide: true, build: (ctx) => buildPanel(ctx) },
  staff: { title: 'Staff', wide: true, build: (ctx, arg) => staffPanel(ctx, arg) },
};
