import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { gagDetail, incidentDetail, routeAmbient, shippedDetail, ambientDetail } from './ambient.js';

const fake = (claims = true) => {
  const sent = [];
  return { sent, send: (e) => { sent.push(ambientDetail(e)); return claims; }, sendDetail: (d) => { if (!d) return false; sent.push(d); return claims; } };
};
const state = { products: [{ id: 'p1', version: 3, score: 8.4 }, { id: 'p0', version: 1, score: 6 }] };

it('a toast with a topic goes to the world only under quiet toasts', () => {
  const e = { type: 'toast', topic: 'progress', subjectId: 'p1', text: 'x' };
  const a = fake();
  expect(routeAmbient(a, e, state, { quiet: true })).toBe(true);
  expect(a.sent).toEqual([ambientDetail(e)]);
  const b = fake();
  expect(routeAmbient(b, e, state, { quiet: false })).toBe(false);
  expect(b.sent).toEqual([]);
  expect(routeAmbient(fake(), { type: 'toast', text: 'no topic' }, state, { quiet: true })).toBe(false);
});

it('an unclaimed event comes back false so the caller shows it the usual way', () => {
  expect(routeAmbient(fake(false), { type: 'toast', topic: 'mood', text: 'x' }, state)).toBe(false);
});

it('a gag sends its caption whatever the switches say', () => {
  const e = { type: 'quietEvent', eventId: 'printer_jam', subjectId: null };
  const a = fake();
  routeAmbient(a, e, state, { quiet: false });
  expect(a.sent).toEqual([gagDetail(e, state)]);
});

it('only minor incidents and their all-clear leave the toast stack, and only under quiet toasts', () => {
  const minor = { type: 'incident', severity: 2, productId: 'p1', caught: false };
  const clear = { type: 'incidentResolved', severity: 2, productId: 'p1' };
  const major = { type: 'incident', severity: 4, productId: 'p1', caught: false };
  const a = fake();
  expect(routeAmbient(a, minor, state, { quiet: true })).toBe(true);
  expect(routeAmbient(a, clear, state, { quiet: true })).toBe(true);
  expect(a.sent).toEqual([incidentDetail(minor), incidentDetail(clear)]);
  expect(routeAmbient(fake(), major, state, { quiet: true })).toBe(false);
  expect(routeAmbient(fake(), minor, state, { quiet: false })).toBe(false);
});

it('a product update shows its shipped bubble only under oneLaunchCard; a first launch never does', () => {
  const upd = { type: 'launch', productId: 'p1' };
  const a = fake();
  expect(routeAmbient(a, upd, state, { oneLaunchCard: true, prevScore: 9 })).toBe(true);
  expect(a.sent).toEqual([shippedDetail(state.products[0], 9)]);
  expect(routeAmbient(fake(), upd, state, { oneLaunchCard: false })).toBe(false);
  expect(routeAmbient(fake(), { type: 'launch', productId: 'p0' }, state, { oneLaunchCard: true })).toBe(false);
  expect(routeAmbient(fake(), { type: 'launch', productId: 'nope' }, state, { oneLaunchCard: true })).toBe(false);
});

it('the game routes its ambient news through routeAmbient, never by hand', () => {
  const src = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  expect(src).toContain('routeAmbient(');
  expect(src).not.toMatch(/ambient\.(send|sendDetail)\(/);
});
