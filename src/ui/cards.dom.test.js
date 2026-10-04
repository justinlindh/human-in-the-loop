// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cardOptions, showCard, CARDS } from './cards.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); delete document.documentElement.dataset.cardPhase; delete window.__HITL_CARD; });

it('reads a card and its timing from the query, and ignores unknown cards', () => {
  expect(cardOptions('?mock=garage')).toBe(null);
  expect(cardOptions('?card=nope')).toBe(null);
  expect(cardOptions('?card=printer-end')).toMatchObject({ id: 'printer-end', hold: CARDS['printer-end'].hold, fade: 0.5, freeze: false });
  expect(cardOptions('?card=printer-title&hold=1.5&fade=0.2&freeze')).toMatchObject({ hold: 1.5, fade: 0.2, freeze: true });
  expect(cardOptions('?card=printer-title&hold=abc&fade=-1')).toMatchObject({ hold: CARDS['printer-title'].hold, fade: 0.5 });
});

it('fades in, holds, fades out and leaves nothing behind', async () => {
  const layer = document.createElement('div'); document.body.append(layer);
  const { done } = showCard(layer, cardOptions('?card=printer-title&hold=2&fade=1'));
  expect(layer.querySelector('.hitl-card .card-title').textContent).toBe('PaperJamSession');
  expect(document.documentElement.dataset.cardPhase).toBe('in');
  vi.advanceTimersByTime(1000);
  expect(window.__HITL_CARD.phase).toBe('hold');
  vi.advanceTimersByTime(2000);
  expect(window.__HITL_CARD.phase).toBe('out');
  vi.advanceTimersByTime(1000);
  await done;
  expect(window.__HITL_CARD).toMatchObject({ phase: 'done', done: true });
  expect(layer.querySelector('.hitl-card')).toBe(null);
});

it('stays on the card when frozen', () => {
  const layer = document.createElement('div'); document.body.append(layer);
  showCard(layer, cardOptions('?card=printer-end&freeze'));
  vi.advanceTimersByTime(60000);
  expect(window.__HITL_CARD.phase).toBe('hold');
  expect(layer.querySelector('.card-url b').textContent).toBe('humanintheloopgame.com');
});
