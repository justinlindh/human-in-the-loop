// @vitest-environment happy-dom
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createToasts } from './toasts.js';
import { createAmbient, ambientDetail, incidentDetail, SHORT_MAX } from './ambient.js';
import { pacingOn } from './pacing.js';
import { pTick, pReset } from './pclock.js';
import { B } from '../sim/balance.js';

vi.hoisted(() => vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) }))));
afterAll(() => vi.unstubAllGlobals());

let listeners;
beforeEach(() => {
  pReset();
  vi.useFakeTimers();
  listeners = vi.spyOn(globalThis, 'addEventListener');
});
afterEach(() => {
  for (const args of listeners.mock.calls) removeEventListener(...args);
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
  delete B.pacing;
});

const make = (quiet) => {
  const root = document.createElement('div');
  document.body.append(root);
  const toasts = createToasts(root, { quiet: () => quiet });
  const texts = () => [...root.querySelectorAll('.toast .tt')].map((n) => n.textContent);
  return { toasts, texts };
};

describe('toasts under quietToasts', () => {
  it('shows game-started toasts at least 15 s apart', () => {
    const { toasts, texts } = make(true);
    toasts.push('Goal complete: Launch it', 'good');
    toasts.push('Hired Priya', 'good');
    pTick(1);
    expect(texts()).toEqual(['Goal complete: Launch it']);
    pTick(14000);
    expect(texts()).toEqual(['Goal complete: Launch it']);
    pTick(1100);
    expect(texts()).toEqual(['Goal complete: Launch it', 'Hired Priya']);
  });

  it('shows them 0.7 s apart with the switch off', () => {
    const { toasts, texts } = make(false);
    toasts.push('Goal complete: Launch it', 'good');
    toasts.push('Hired Priya', 'good');
    pTick(1);
    expect(texts()).toHaveLength(1);
    pTick(800);
    expect(texts()).toEqual(['Goal complete: Launch it', 'Hired Priya']);
  });

  it('folds news about one subject into the toast waiting or just shown', () => {
    const { toasts, texts } = make(true);
    toasts.push('Priya joined the team!', 'good', { subject: 'p1' });
    toasts.push('Sold the desk', 'info');
    toasts.push('Priya is now a Lead.', 'good', { subject: 'p1' });
    pTick(1);
    expect(texts()).toEqual(['Priya is now a Lead.']);
    toasts.push('Priya earned a trait.', 'good', { subject: 'p1' });
    expect(texts()).toEqual(['Priya earned a trait.']);
    pTick(15100);
    expect(texts()).toEqual(['Priya earned a trait.', 'Sold the desk']);
  });

  it('lets a severe toast and a player refusal through at once', () => {
    const { toasts, texts } = make(true);
    toasts.push('Goal complete: Launch it', 'good');
    pTick(1);
    toasts.push('Production is down', 'bad');
    toasts.push('Not enough cash to hire', 'warn', { player: true });
    expect(texts()).toEqual(['Goal complete: Launch it', 'Production is down', 'Not enough cash to hire']);
  });

  it('keeps a warning in the 15 s queue, where today it shows at once', () => {
    const quiet = make(true);
    quiet.toasts.push('Cash is getting low', 'warn');
    pTick(1);
    expect(quiet.texts()).toEqual(['Cash is getting low']);
    quiet.toasts.push('Cash is lower', 'warn');
    pTick(1000);
    expect(quiet.texts()).toEqual(['Cash is getting low']);
    document.body.replaceChildren();
    const loud = make(false);
    loud.toasts.push('Cash is getting low', 'warn');
    loud.toasts.push('Cash is lower', 'warn');
    expect(loud.texts()).toHaveLength(2);
  });
});

describe('status news', () => {
  it('is turned into a short ambient event for the world', () => {
    const d = ambientDetail({ topic: 'back', subjectId: 'p1', tone: 'good', text: 'Priya is back from the vacation, full of ideas.', short: 'Back from a long vacation with big ideas' });
    expect(d).toMatchObject({ topic: 'back', subjectId: 'p1', subjectKind: 'staff', icon: 'vacation', tone: 'good' });
    expect(d.text.length).toBeLessThanOrEqual(SHORT_MAX);
    expect(ambientDetail({ text: 'No topic' })).toBeNull();
  });

  it('is claimed by the renderer, or left to a toast when nobody draws it', () => {
    const target = new EventTarget();
    const ambient = createAmbient({ target });
    const news = { topic: 'mood', subjectId: 'p2', tone: 'warn', text: 'Sam looks exhausted.' };
    expect(ambient.send(news)).toBe(false);
    const seen = [];
    target.addEventListener('hitl:ambient', (e) => { seen.push(e.detail); e.preventDefault(); });
    expect(ambient.send(news)).toBe(true);
    expect(seen).toHaveLength(1);
    // The same subject and topic within 15 s folds in without a second event.
    expect(ambient.send(news)).toBe(true);
    expect(seen).toHaveLength(1);
    pTick(15100);
    expect(ambient.send(news)).toBe(true);
    expect(seen).toHaveLength(2);
  });
});

describe('minor incidents', () => {
  it('become ambient cues below severity 3 and keep their toast from 3 up', () => {
    expect(incidentDetail({ type: 'incident', productId: 'pr1', severity: 2, caught: false }))
      .toEqual({ topic: 'incident', subjectId: 'pr1', subjectKind: 'product', text: 'SEV4', icon: 'warn', tone: 'bad' });
    expect(incidentDetail({ type: 'incident', productId: 'pr1', severity: 1, caught: false }).text).toBe('SEV5');
    expect(incidentDetail({ type: 'incident', productId: 'pr1', severity: 2, caught: true }))
      .toMatchObject({ text: 'Caught early', icon: 'shield', tone: 'good' });
    expect(incidentDetail({ type: 'incidentResolved', productId: 'pr1', severity: 2 }))
      .toMatchObject({ text: 'All clear', icon: 'check', tone: 'good' });
    expect(incidentDetail({ type: 'incident', productId: 'pr1', severity: 3 })).toBeNull();
    expect(incidentDetail({ type: 'incidentResolved', productId: 'pr1', severity: 4 })).toBeNull();
  });

  it('keeps the incident and its all-clear as two cues, and falls back to a toast when unclaimed', () => {
    const target = new EventTarget();
    const ambient = createAmbient({ target });
    const down = incidentDetail({ type: 'incident', productId: 'pr1', severity: 2 });
    const clear = incidentDetail({ type: 'incidentResolved', productId: 'pr1', severity: 2 });
    expect(ambient.sendDetail(down)).toBe(false);
    const seen = [];
    target.addEventListener('hitl:ambient', (e) => { seen.push(e.detail.text); e.preventDefault(); });
    expect(ambient.sendDetail(down)).toBe(true);
    expect(ambient.sendDetail(clear)).toBe(true);
    expect(seen).toEqual(['SEV4', 'All clear']);
  });
});

describe('the switch', () => {
  it('follows B.pacing and is off without it', () => {
    expect(pacingOn('quietToasts')).toBe(false);
    B.pacing = { quietToasts: true };
    expect(pacingOn('quietToasts')).toBe(true);
    B.pacing.quietToasts = false;
    expect(pacingOn('quietToasts')).toBe(false);
  });
});
