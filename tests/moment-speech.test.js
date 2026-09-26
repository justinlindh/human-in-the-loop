import { it, expect } from 'vitest';
import { createMomentSpeech } from '../src/render/moment-speech.js';

it('spaces moment lines on render time without waiting for a sim week', () => {
  const q = createMomentSpeech(), shown = [];
  q.add({ id: 'a', moment: 'printer_jam' });
  q.add({ id: 'b', moment: 'printer_jam' });
  const show = e => { shown.push(e.id); return 3; };
  q.step(1, () => 'play', show);
  q.step(3, () => 'play', show);
  expect(shown).toEqual(['a']);
  q.step(1, () => 'play', show);
  expect(shown).toEqual(['a', 'b']);
});

it('holds a payoff for its beat, drops skipped scenes, and bounds stale queues', () => {
  const q = createMomentSpeech(), shown = [];
  const show = e => { shown.push(e.id); return 3; };
  q.add({ id: 'after', moment: 'printer_jam' });
  q.step(20, () => 'wait', show);
  expect(shown).toEqual([]);
  q.step(1, () => 'play', show);
  expect(shown).toEqual(['after']);
  q.add({ id: 'skip', moment: 'printer_jam' });
  q.step(1, () => 'drop', show);
  expect(q.size).toBe(0);
  for (let i = 0; i < 40; i++) q.add({ id: i, moment: 'x' });
  expect(q.size).toBeLessThanOrEqual(24);
  q.step(46, () => 'wait', show);
  expect(q.size).toBe(0);
});

it('replacing an opening with its resolution discards the old lines', () => {
  const q = createMomentSpeech();
  q.add({ id: 'open', moment: 'printer_jam' });
  q.clear('printer_jam');
  q.add({ id: 'resolved', moment: 'printer_jam' });
  const shown = [];
  q.step(1, () => 'play', e => { shown.push(e.id); return 1; });
  expect(shown).toEqual(['resolved']);
});

it('hands moment lines to the renderer before a decision can freeze the weekly pacer', async () => {
  const { createPacer } = await import('../src/pacing.js');
  const p = createPacer();
  const speech = { type: 'say', id: 'moment', staffId: 's1', text: 'The printer again.', moment: 'printer_jam' };
  expect(p.schedule([{ type: 'decision' }, speech])).toEqual([{ type: 'decision' }, speech]);
  expect(p.queued).toBe(0);
});
