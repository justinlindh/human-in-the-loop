import { describe, expect, it } from 'vitest';
import { createStandupSpeech, standupContext, standupRevision, standupText } from './standup-speech.js';
import { B } from '../sim/balance.js';
import { standupConversation } from '../sim/standup.js';

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

describe('live conversation premise', () => {
  function setup() {
    const staff = ['a', 'b'].map(id => ({ id, mood: 'ok', role: 'engineer', assignment: { type: 'idle', targetId: null } }));
    return { week: 100, staff, products: [{ id: 'p', name: 'Notes' }], projects: [], flags: {}, era: { id: 'classic' }, outage: { productId: 'p', kind: 'bug', weeks: 2 } };
  }
  const generate = s => standupConversation(s, s.staff, s.staff.map(p => ({ staffId: p.id, text: 'Update.' })));
  it('binds only matching event lines, and retains the original subject across later weekly meetings', () => {
    const s = setup(), lines = generate(s), context = standupContext(s, lines);
    expect(standupContext(s, [{ staffId: 'a', text: 'Different event.' }])).toBeNull();
    expect(standupContext({ flags: {} }, lines)).toBeNull();
    s.week++; s.outage.weeks++; generate(s);
    expect(standupRevision(context, s)).toBeNull();
    expect(context.script).toBe('standup_outage_logs');
    expect(standupContext(JSON.parse(JSON.stringify(s)), s.flags.standupConversation.lines)).not.toBeNull();
  });
  it('revises recovered, replaced, renamed and removed outage subjects without guessing from dialogue text', () => {
    for (const change of [s => { s.outage = null; }, s => { s.outage.weeks = 0; }, s => { s.outage.kind = 'db_wipe'; }, s => { s.outage.productId = 'other'; }, s => { s.products[0].killed = true; }, s => { s.products[0].name = 'Renamed'; }]) {
      const s = setup(), context = standupContext(s, generate(s)); change(s);
      expect(standupRevision(context, s)).toMatch(/incident changed/);
    }
  });
  it('refreshes a project percentage at its turn without altering state or restarting the exchange', () => {
    const s = setup(); s.outage = null;
    s.staff[0].assignment = { type: 'project', targetId: 'j' };
    s.projects = [{ id: 'j', name: 'Loopo', progress: 20, pointsNeeded: 100 }];
    const lines = generate(s), context = standupContext(s, lines);
    s.projects[0].progress = 65;
    const before = JSON.stringify(s);
    expect(standupRevision(context, s)).toBeNull();
    expect(standupText(lines[1], context, s)).toContain('65%');
    expect(JSON.stringify(s)).toBe(before);
    s.projects = [];
    expect(standupRevision(context, s)).toMatch(/work queue changed/);
  });
  it('revises a subject whose owner leaves or changes assignment', () => {
    const s = setup(); s.outage = null; s.staff[0].assignment.type = 'oversight'; s.era.id = 'agents';
    const context = standupContext(s, generate(s));
    expect(context.topic).toBe('oversight');
    s.staff[0].assignment.type = 'idle';
    expect(standupRevision(context, s)).toMatch(/assignments changed/);
    s.staff = [];
    expect(standupRevision(context, s)).toMatch(/assignments changed/);
  });
});
