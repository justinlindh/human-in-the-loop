import { describe, expect, it } from 'vitest';
import { createStandupSpeech } from './standup-speech.js';
import { B } from '../sim/balance.js';

describe('ordered standup turns', () => {
  const lines = [{ staffId: 'a', text: 'Question?' }, { staffId: 'b', text: 'Answer.' }, { staffId: 'a', text: 'Thanks.' }];
  it('retries the same denied line and completes only after the final reading hold', () => {
    const q = createStandupSpeech(lines), attempts = [], shown = [];
    const show = l => { attempts.push(l.text); if (attempts.length < 3) return 0; shown.push(l.text); return 4; };
    q.step(0.1, () => 'play', show);
    q.step(0.1, () => 'play', show);
    expect(q.index).toBe(0);
    expect(q.done).toBe(false);
    q.step(0.1, () => 'play', show);
    expect(attempts).toEqual(['Question?', 'Question?', 'Question?']);
    q.step(3, () => 'play', show);
    expect(shown).toEqual(['Question?']);
    q.step(1 + B.standupSpeechGap, () => 'play', show);
    q.step(4 + B.standupSpeechGap, () => 'play', show);
    expect(shown).toEqual(lines.map(l => l.text));
    expect(q.done).toBe(false);
    q.step(4 + B.standupSpeechGap, () => 'play', show);
    expect(q.done).toBe(true);
  });
  it('waits for a walking speaker, skips a departed speaker, and preserves the remaining order', () => {
    const q = createStandupSpeech(lines), shown = [];
    q.step(1, () => 'wait', () => { throw Error('still walking'); });
    expect(q.index).toBe(0);
    for (let i = 0; i < 10; i++) q.step(5, l => l.staffId === 'b' ? 'drop' : 'play', l => { shown.push(l.text); return 3; });
    expect(shown).toEqual(['Question?', 'Thanks.']);
    expect(q.done).toBe(true);
  });
  it('does not run while paused, including a turn waiting for admission', () => {
    const q = createStandupSpeech(lines);
    q.step(0, () => 'play', () => { throw Error('paused'); });
    expect(q.index).toBe(0);
  });
  it('replays a line whose bubble a priority scene interrupted, then continues in order', () => {
    const q = createStandupSpeech(lines), shown = [];
    const show = l => { shown.push(l.text); return 4; };
    q.interrupt();
    expect(q.index).toBe(0);
    q.step(0.1, () => 'play', show);
    expect(q.current).toEqual(lines[0]);
    q.interrupt();
    expect(q.index).toBe(0);
    q.step(0.1, () => 'wait', show);
    expect(shown).toEqual(['Question?']);
    for (let i = 0; i < 4; i++) q.step(5, () => 'play', show);
    expect(shown).toEqual(['Question?', 'Question?', 'Answer.', 'Thanks.']);
    expect(q.done).toBe(true);
  });
});
