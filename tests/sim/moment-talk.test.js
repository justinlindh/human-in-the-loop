import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/sim/index.js';
import { makeCtx } from '../../src/sim/registry.js';
import { raiseDecision } from '../../src/sim/events.js';
import { openEventPrompt } from '../../src/sim/prompts.js';
import { EVENTS } from '../../src/data/events.js';
import { MOMENT_TALK, CELEBRATION_TALK } from '../../src/data/moment-talk.js';
import { emitMomentTalk, momentCast, momentTalkSystem } from '../../src/sim/moment-talk.js';
import { game, addStaff } from './helpers.js';
import { B } from '../../src/sim/balance.js';

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
    expect(ctx.events.some(e => e.type === 'say')).toBe(false);
    momentTalkSystem(ctx);
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

  it('leaves ordinary lines alone while a moment is open', () => {
    const s = game(5);
    const ctx = makeCtx(s);
    raiseDecision(ctx, 'printer_jam', s.staff[0].id);
    ctx.emit({ type: 'say', id: 'near', staffId: s.staff[0].id, text: 'Unrelated' });
    momentTalkSystem(ctx);
    expect(ctx.events.find(e => e.id === 'near')).toMatchObject({ text: 'Unrelated' });
    expect(ctx.events.find(e => e.id === 'near').moment).toBeUndefined();
    expect(ctx.events.filter(e => e.type === 'say' && e.moment === 'printer_jam').length).toBeLessThanOrEqual(B.momentTalkLines);
  });

  it('counts someone with no seat as out of range unless the stage names them', () => {
    const s = game(6);
    const seatless = addStaff(s, 'engineer', 'mid');
    seatless.deskId = null;
    const d = { eventId: 'printer_jam', subjectId: null, stage: { x: 0, y: 0 } };
    expect(momentCast(s, d).map(p => p.id)).not.toContain(seatless.id);
    expect(momentCast(s, { ...d, stage: { x: 0, y: 0, staffId: seatless.id } })[0].id).toBe(seatless.id);
  });

  it('a moment that comes back picks lines not heard recently', () => {
    const s = game(8), d = { eventId: 'printer_jam', stage: { x: 1, y: 1 } };
    const heard = [];
    for (let i = 0; i < 2; i++) { const ctx = makeCtx(s); emitMomentTalk(ctx, d); heard.push(...ctx.events.map(e => e.text)); }
    const pool = MOMENT_TALK.printer_jam.open;
    expect(new Set(heard).size).toBe(Math.min(heard.length, pool.length));
  });
});

it('staged Yak prompts use their event pools when opened and answered', () => {
  const s = game(9), ctx = makeCtx(s);
  openEventPrompt(ctx, EVENTS.pet_request, s.staff[0].id);
  momentTalkSystem(ctx);
  const open = ctx.events.filter(e => e.type === 'say');
  expect(open.length).toBeGreaterThan(0);
  expect(open.every(e => e.moment === 'pet_request')).toBe(true);
  const res = dispatch(s, { type: 'answerPrompt', promptId: s.chatPrompts.at(-1).id, choice: 1 });
  expect(res.ok).toBe(true);
  const lines = res.events.filter(e => e.type === 'say');
  expect(lines).toHaveLength(1);
  expect(MOMENT_TALK.pet_request.choices[1]).toContain(lines[0].text);
});

it('a launch gets a line or two of its own, at most once per party gap, and never rewrites other lines', () => {
  const s = game(11), rng = { ...s.rng }, nextId = s.nextId;
  const week = (extra = []) => { const ctx = makeCtx(s); ctx.emit({ type: 'launch', productId: 'p1' }); for (const e of extra) ctx.emit(e); momentTalkSystem(ctx); return ctx.events.filter(e => e.type === 'say'); };
  const first = week([{ type: 'say', staffId: s.staff[0].id, text: 'Unrelated', id: 'ambient' }]);
  const party = first.filter(e => e.moment === 'launch');
  expect(party.length).toBeGreaterThan(0);
  expect(party.length).toBeLessThanOrEqual(B.momentTalkLines);
  for (const e of party) expect(CELEBRATION_TALK.launch.open).toContain(e.text);
  expect(first.find(e => e.id === 'ambient')).toMatchObject({ text: 'Unrelated' });
  s.week += 1;
  expect(week().length).toBe(0);
  s.week += B.partyTalkGapWeeks;
  expect(week().length).toBeGreaterThan(0);
  expect(s.rng).toEqual(rng);
  expect(s.nextId).toBe(nextId);
});
