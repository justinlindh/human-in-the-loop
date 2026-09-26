import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/sim/index.js';
import { makeCtx } from '../../src/sim/registry.js';
import { raiseDecision } from '../../src/sim/events.js';
import { openEventPrompt } from '../../src/sim/prompts.js';
import { EVENTS } from '../../src/data/events.js';
import { MOMENT_TALK, CELEBRATION_TALK } from '../../src/data/moment-talk.js';
import { emitMomentTalk, momentCast, momentTalkSystem } from '../../src/sim/moment-talk.js';
import { game, addStaff } from './helpers.js';

describe('moment dialogue', () => {
  it('covers every staged decision and each choice with original short pools', () => {
    for (const ev of Object.values(EVENTS).filter(e => e.stage)) {
      const pool = MOMENT_TALK[ev.id];
      expect(pool, ev.id).toBeTruthy();
      expect(pool.choices, ev.id).toHaveLength(ev.choices.length);
      for (const lines of [pool.open, ...pool.choices]) {
        expect(lines.length, ev.id).toBeGreaterThanOrEqual(2);
        for (const line of lines) expect(line.length, line).toBeLessThanOrEqual(70);
      }
    }
  });

  it('raises and resolves the printer with tagged cast lines from the right pool', () => {
    const s = game(7), ctx = makeCtx(s);
    expect(raiseDecision(ctx, 'printer_jam', s.staff[0].id)).toBe(true);
    const lines = ctx.events.filter(e => e.type === 'say');
    expect(lines).toHaveLength(2);
    for (const e of lines) {
      expect(e.moment).toBe('printer_jam');
      expect(MOMENT_TALK.printer_jam.open).toContain(e.text);
      expect(momentCast(s, s.pendingDecision).map(p => p.id)).toContain(e.staffId);
    }
    const res = dispatch(s, { type: 'resolveDecision', choice: 2 });
    expect(res.ok).toBe(true);
    const after = res.events.filter(e => e.type === 'say' && e.moment === 'printer_jam');
    expect(after).toHaveLength(1);
    expect(MOMENT_TALK.printer_jam.choices[2]).toContain(after[0].text);
    expect(s.chatLog.some(e => [...lines, ...after].some(l => l.id === e.id))).toBe(false);
  });

  it('prefers the staged reader and excludes remote, away and sabbatical speakers', () => {
    const s = game(2);
    const reader = addStaff(s, 'engineer', 'mid');
    const d = { eventId: 'resignation_letter', subjectId: s.staff[0].id, stage: { staffId: reader.id, x: 1, y: 1 } };
    s.staff[0].remote = true;
    s.staff[1].assignment.type = 'sabbatical';
    expect(momentCast(s, d).map(p => p.id)).toEqual([reader.id]);
    reader.mood = 'away';
    const ctx = makeCtx(s);
    emitMomentTalk(ctx, d);
    expect(ctx.events).toEqual([]);
  });

  it('keeps cosmetic draws and ids separate from simulation state and survives serialization', () => {
    const s = game(3), d = { eventId: 'printer_jam', stage: { x: 1, y: 1 } };
    const a = makeCtx(s), b = makeCtx(JSON.parse(JSON.stringify(s)));
    const rng = { ...s.rng }, nextId = s.nextId;
    emitMomentTalk(a, d);
    emitMomentTalk(b, d);
    expect(a.events).toEqual(b.events);
    expect(s.rng).toEqual(rng);
    expect(s.nextId).toBe(nextId);
    const ids = a.events.map(e => e.id);
    emitMomentTalk(a, d, 0);
    expect(new Set(a.events.map(e => e.id)).size).toBe(a.events.length);
    expect(a.events.length).toBeGreaterThan(ids.length);
  });

  it('replaces ambient cast speech while open and leaves distant staff alone', () => {
    const s = game(5);
    const far = addStaff(s, 'engineer', 'mid');
    const desk = s.office.placed.find(d => d.id === far.deskId);
    desk.x = 100; desk.y = 100;
    const ctx = makeCtx(s);
    raiseDecision(ctx, 'printer_jam', s.staff[0].id);
    ctx.emit({ type: 'say', id: 'near', staffId: s.staff[0].id, text: 'Unrelated' });
    ctx.emit({ type: 'say', id: 'far', staffId: far.id, text: 'Elsewhere' });
    momentTalkSystem(ctx);
    expect(ctx.events.find(e => e.id === 'near').moment).toBe('printer_jam');
    expect(ctx.events.find(e => e.id === 'far').text).toBe('Elsewhere');
  });
});

it('staged Yak prompts use their event pools when opened and answered', () => {
  const s = game(9), ctx = makeCtx(s);
  openEventPrompt(ctx, EVENTS.pet_request, s.staff[0].id);
  expect(ctx.events.filter(e => e.type === 'say').every(e => e.moment === 'pet_request')).toBe(true);
  const res = dispatch(s, { type: 'answerPrompt', promptId: s.chatPrompts.at(-1).id, choice: 1 });
  expect(res.ok).toBe(true);
  const lines = res.events.filter(e => e.type === 'say');
  expect(lines).toHaveLength(1);
  expect(MOMENT_TALK.pet_request.choices[1]).toContain(lines[0].text);
});

it('celebrations replace unrelated party chatter without changing the sim RNG', () => {
  const s = game(11), ctx = makeCtx(s), rng = { ...s.rng }, nextId = s.nextId;
  ctx.emit({ type: 'launch', productId: 'p1' });
  ctx.emit({ type: 'say', staffId: s.staff[0].id, text: 'Unrelated', id: 'ambient' });
  momentTalkSystem(ctx);
  for (const e of ctx.events.filter(e => e.type === 'say')) {
    expect(e.moment).toBe('launch');
    expect(CELEBRATION_TALK.launch.open).toContain(e.text);
  }
  expect(s.rng).toEqual(rng);
  expect(s.nextId).toBe(nextId);
});
