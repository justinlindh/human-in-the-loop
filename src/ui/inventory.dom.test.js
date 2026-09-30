// @vitest-environment happy-dom
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { inventoryView, hasInventory } from './panels/inventory.js';
import { reportsPanel } from './panels/reports.js';
import { createGame, dispatch } from '../sim/index.js';
import { newInventory, sellBoxes } from '../sim/boxed.js';
import { makeCtx } from '../sim/registry.js';
import { addProduct } from '../../tests/sim/helpers.js';

vi.hoisted(() => vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) }))));
afterAll(() => vi.unstubAllGlobals());

afterEach(() => { document.body.replaceChildren(); vi.clearAllTimers(); vi.useRealTimers(); });

it('orders by tap, preserves focus during refresh, and shows shipment and patch refusals as text', () => {
  const s = createGame({ seed: 17, startEra: 'preinternet' }), p = addProduct(s);
  p.angle = 'boxed'; p.customers = p.mrr = 0; p.boxed = newInventory();
  const act = vi.fn((a) => dispatch(s, a));
  const view = inventoryView({ getState: () => s, act, open: vi.fn() });
  document.body.append(view.el); const before = JSON.stringify(s); view.update(s, true);
  expect(JSON.stringify(s)).toBe(before);
  const order = view.el.querySelector('.inventory-action button');
  expect(order.textContent).toContain('Order 100'); expect(order.textContent).toContain('$800');
  order.focus(); order.click(); view.update(s);
  expect(act).toHaveBeenCalledWith({ type: 'orderBatch', productId: p.id, units: 100 });
  expect(view.el.querySelector('.inventory-action button')).toBe(order);
  expect(order.disabled).toBe(true); expect(view.el.textContent).toContain('A batch is already on its way');
  expect(view.el.textContent).toContain('100 copies due in 2 playable weeks');
  s.week = 2; sellBoxes(makeCtx(s), p, 50); view.update(s);
  expect(order.disabled).toBe(false); expect(view.el.textContent).toContain('No batch on order');
  p.health = 20; view.update(s);
  const patch = [...view.el.querySelectorAll('button')].find((b) => b.textContent.startsWith('Mail patch'));
  patch.click(); view.update(s);
  expect(act).toHaveBeenLastCalledWith({ type: 'mailPatch', productId: p.id });
  expect(patch.disabled).toBe(true); expect(view.el.textContent).toContain('Installed copies are already patched');
  expect(p.mrr).toBe(0);
});

it('keeps inventory controls available in a saved career without the preview parameter', () => {
  vi.useFakeTimers();
  const s = createGame({ seed: 17, startEra: 'preinternet' });
  const panel = reportsPanel({ getState: () => s, act: (a) => dispatch(s, a), open: vi.fn() }, { tab: 'inventory' });
  document.body.append(panel.el, panel.tabs); vi.runOnlyPendingTimers();
  expect(panel.tabs.textContent).toContain('Inventory');
  expect(panel.el.textContent).toContain('No physical releases yet');
  expect(panel.el.textContent).toContain('Installed copies never become subscribers');
  expect(hasInventory(createGame({ seed: 17 }))).toBe(false);
  panel.destroy();
});
