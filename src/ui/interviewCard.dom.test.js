// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { interviewBlock, feedSeed } from './interviewCard.js';
import { pReset, pTick } from './pclock.js';

beforeEach(() => pReset());
afterEach(() => document.body.replaceChildren());

function setup({ feed = null, askOk = true } = {}) {
  const d = { eventId: 'ai_interview_watch', vars: { candidateId: 'c9', tells: ['glitch'], decoy: 'cat', lines: [
    { who: 'Interviewer', text: 'Q1?' }, { who: 'Ann', text: 'A1' }, { who: 'Interviewer', text: 'Q2?' }, { who: 'Ann', text: 'A2' }] } };
  const flags = { aiWatch: { asked: false } };
  const act = vi.fn(() => {
    if (!askOk) return { ok: false, reason: 'Already asked' };
    flags.aiWatch.asked = true; d.vars.lines.push({ who: 'Ann', text: 'More detail.' });
    return { ok: true };
  });
  const ctx = { getState: () => ({ flags }), act, sfx: vi.fn() };
  const renderer = feed ? { interviewFeed: feed } : null;
  const b = interviewBlock(ctx, d, renderer);
  document.body.append(b.el);
  return { b, d, act, ctx };
}
const lines = () => [...document.querySelectorAll('.iv-line')].map((l) => l.textContent);
const ask = () => document.querySelector('.iv-ask');

it('shows the transcript one line at a time and offers the follow-up only once it has played', () => {
  const { b } = setup();
  expect(lines()).toEqual([]);
  expect(ask().hidden).toBe(true);
  pTick(500);
  expect(lines()).toHaveLength(1);
  pTick(1500);
  expect(lines()).toHaveLength(2);
  pTick(1500);
  pTick(1500);
  expect(lines()).toHaveLength(4);
  expect(ask().hidden).toBe(false);
  expect(document.querySelector('.iv-skip').hidden).toBe(true);
  b.dispose();
});

it('Skip ahead shows everything at once', () => {
  const { b } = setup();
  pTick(500);
  document.querySelector('.iv-skip').click();
  expect(lines()).toHaveLength(4);
  expect(ask().hidden).toBe(false);
  b.dispose();
});

it('the follow-up asks the sim once, adds its line, and then goes', () => {
  const { b, act } = setup();
  b.showAll();
  ask().click();
  expect(act).toHaveBeenCalledWith({ type: 'askFollowUp' });
  pTick(2500);
  expect(lines()[4]).toContain('More detail.');
  expect(ask().hidden).toBe(true);
  b.sync();
  expect(ask().hidden).toBe(true);
  b.dispose();
});

it('a refused follow-up keeps the button and adds nothing', () => {
  const { b } = setup({ askOk: false });
  b.showAll();
  ask().click();
  expect(lines()).toHaveLength(4);
  expect(ask().hidden).toBe(false);
  b.dispose();
});

it('mounts the renderer feed with the tape and disposes it with the card', () => {
  const dispose = vi.fn();
  const canvas = document.createElement('canvas');
  const feed = vi.fn(() => ({ canvas, dispose }));
  const { b } = setup({ feed });
  expect(feed).toHaveBeenCalledWith({ seed: feedSeed('c9'), tells: ['glitch'], decoy: 'cat' });
  expect(document.querySelector('.iv-feed canvas')).toBe(canvas);
  b.dispose();
  expect(dispose).toHaveBeenCalledOnce();
});

it('keeps a placeholder frame when there is no feed', () => {
  const { b } = setup();
  expect(document.querySelector('.iv-feed').textContent).toContain('Connecting');
  b.dispose();
});
