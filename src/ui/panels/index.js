import { h } from '../dom.js';
import { MENU } from '../menu.js';
import { buildPanel } from './build.js';
import { staffPanel } from './staff.js';
import { marketingPanel } from './marketing.js';
import { modelsPanel } from './models.js';
import { automationPanel } from './automation.js';

const stub = (label) => ({
  build: () => ({ el: h('div.empty', { text: `${label} is on its way.` }) }),
});

export const PANELS = {
  ...Object.fromEntries(MENU.map((m) => [m.id, stub(m.label)])),
  build: { title: 'Build', wide: true, build: (ctx) => buildPanel(ctx) },
  staff: { title: 'Staff', wide: true, build: (ctx, arg) => staffPanel(ctx, arg) },
  marketing: { title: 'Marketing', wide: true, build: (ctx) => marketingPanel(ctx) },
  models: { title: 'Model Vendors', wide: true, build: (ctx) => modelsPanel(ctx) },
  automation: { title: 'Automation', wide: true, build: (ctx) => automationPanel(ctx) },
};
