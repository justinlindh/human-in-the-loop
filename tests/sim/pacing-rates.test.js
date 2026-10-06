import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { B } from '../../src/sim/balance.js';
import { makeCtx } from '../../src/sim/registry.js';
import { eventChance, raiseDecision } from '../../src/sim/events.js';
import { postmortemSeverity } from '../../src/sim/incidents.js';
import { moonshotSystem } from '../../src/sim/moonshot.js';
import { promptChance } from '../../src/sim/prompts.js';
import { mailSystem, deliversAsMail } from '../../src/sim/mail.js';
import { MAIL_TEMPLATES, EVENT_MAIL, AMBIENT } from '../../src/data/mail.js';
import { EVENTS } from '../../src/data/events.js';
import { game, addStaff, addDesks, addProduct } from './helpers.js';

function company(seed = 1) {
  const s = game(seed);
  s.week = 60;
  addDesks(s, 8);
  for (let i = 0; i < 6; i++) addStaff(s, 'engineer', 'mid', { hiredWeek: 0 });
  for (const p of s.staff) { p.mood = 'ok'; p.strain = 0; p.meaning = 60; }
  addProduct(s, { name: 'Ledgerly', customers: 300, mrr: 6000 });
  return s;
}

let keepPacing;
let keepMail;
beforeEach(() => { keepPacing = { ...B.pacing }; keepMail = { ...B.mail }; });
afterEach(() => { Object.assign(B.pacing, keepPacing); Object.assign(B.mail, keepMail); });

describe('askRates: fewer events and staff prompts come up', () => {
  it('on, the weekly event and prompt rolls use B.askRates; off, today\'s chances', () => {
    B.pacing.askRates = false;
    expect(eventChance()).toBe(B.randomEventChance);
    expect(promptChance()).toBe(B.chatPromptChance);
    B.pacing.askRates = true;
    expect(eventChance()).toBe(B.askRates.randomEventChance);
    expect(promptChance()).toBe(B.askRates.chatPromptChance);
    expect(B.askRates.randomEventChance).toBeLessThan(B.randomEventChance);
    expect(B.askRates.chatPromptChance).toBeLessThan(B.chatPromptChance);
  });
});

describe('quietEvents: small events play out without a card', () => {
  const QUIET = ['ai_summit', 'ai_summit_hackathon', 'ai_summit_panel', 'conference_expo', 'four_day_week_review', 'music_night_genre', 'pet_mishap', 'ping_pong', 'printer_jam'];

  it('on, the first moonshot check-in asks and later ones keep going quietly', () => {
    B.pacing.quietEvents = true;
    const s = company();
    s.cash = 5e6;
    s.flags.moonshot = { active: true, since: s.week, checkins: 0, name: 'Halo', weekly: 1000 };
    s.week += B.moonshotCheckinWeeks;
    moonshotSystem(makeCtx(s));
    expect(s.pendingDecision?.eventId).toBe('moonshot_checkin');
    s.pendingDecision = null;
    s.flags.moonshot.checkins = 1;
    s.week += B.moonshotCheckinWeeks;
    const ctx = makeCtx(s);
    moonshotSystem(ctx);
    expect(s.pendingDecision).toBeNull();
    expect(ctx.events).toContainEqual(expect.objectContaining({ type: 'quietEvent', eventId: 'moonshot_checkin', choice: 0 }));
  });

  it('the quiet set is the gags, the annual expo, the summit trio and music night', () => {
    expect(Object.keys(EVENTS).filter((id) => EVENTS[id].quiet).sort()).toEqual(QUIET);
  });

  it('on, a quiet event applies its default, says so in Yak, and opens no card or ask', () => {
    B.pacing.quietEvents = true;
    B.pacing.askQueue = true;
    const s = company();
    s.cash = 100000;
    const chat = s.chatLog.length;
    const ctx = makeCtx(s);
    expect(raiseDecision(ctx, 'conference_expo', null)).toBe(true);
    expect(s.pendingDecision).toBeNull();
    expect(s.asks).toEqual([]);
    expect(s.chatLog.slice(chat).some((m) => m.text.includes(EVENTS.conference_expo.choices[0].outcome ?? EVENTS.conference_expo.title))).toBe(true);
    expect(ctx.events.some((e) => e.type === 'decision' || e.type === 'askQueued')).toBe(false);
    const quiet = ctx.events.filter((e) => e.type === 'quietEvent');
    expect(quiet).toHaveLength(1);
    expect(quiet[0]).toMatchObject({ eventId: 'conference_expo', subjectId: null, choice: 0, stage: { prop: 'printout', anchor: 'wall' } });
    expect(Object.keys(quiet[0].stage)).toEqual(expect.arrayContaining(['prop', 'anchor', 'x', 'y', 'staffId']));
  });

  it('on, music night picks the winner\'s genre itself and the dance break still happens', () => {
    B.pacing.quietEvents = true;
    const s = company();
    const winner = s.staff.find((p) => !p.founder);
    s.flags.musicNightWinner = winner.id;
    s.flags.musicNightCount = 0;
    const ctx = makeCtx(s);
    raiseDecision(ctx, 'music_night_genre', winner.id);
    expect(s.pendingDecision).toBeNull();
    expect(s.chatLog.some((m) => EVENTS.music_night_genre.choices.some((c) => m.text.includes(c.label)))).toBe(true);
  });

  it('off, a quiet event opens its card as today', () => {
    B.pacing.quietEvents = false;
    const s = company();
    expect(raiseDecision(makeCtx(s), 'conference_expo', null)).toBe(true);
    expect(s.pendingDecision.eventId).toBe('conference_expo');
  });

  it('on, a postmortem asks only after a severity 5 incident', () => {
    B.pacing.quietEvents = true;
    expect(postmortemSeverity()).toBe(5);
    B.pacing.quietEvents = false;
    expect(postmortemSeverity()).toBe(4);
  });
});

describe('letterMail: mail carries only outside letters with a real choice', () => {
  const weeks = (s, n) => {
    const events = [];
    for (let i = 0; i < n; i++) { const ctx = makeCtx(s); mailSystem(ctx); events.push(...ctx.events); s.week++; }
    return events;
  };

  it('the letters are the outside ones: partnership, recruiter, legal and pitch letters', () => {
    expect(MAIL_TEMPLATES.filter((t) => t.letter).map((t) => t.id).sort()).toEqual(['partnership_offer', 'recruiter_poach']);
    expect(Object.keys(EVENT_MAIL).filter((id) => EVENT_MAIL[id].letter).sort()).toEqual(['app_store_rejection', 'blockchain_pitch']);
  });

  it('on, no flavour mail, no inside letters and no reply-all mail arrive, however long the inbox runs', () => {
    B.pacing.letterMail = true;
    Object.assign(B.mail, { ambientChance: 1, actionChance: 1, replyAllChance: 1 });
    const s = company();
    weeks(s, 120);
    const kinds = new Set(s.mail.map((m) => m.kind));
    for (const a of AMBIENT) expect(kinds.has(a.id), a.id).toBe(false);
    for (const k of kinds) expect(['partnership_offer', 'recruiter_poach'], k).toContain(k);
    expect(kinds.size).toBeGreaterThan(0);
  });

  it('off, flavour mail and every letter arrive as today', () => {
    B.pacing.letterMail = false;
    Object.assign(B.mail, { ambientChance: 1, actionChance: 1 });
    const s = company();
    weeks(s, 120);
    const kinds = new Set(s.mail.map((m) => m.kind));
    expect([...kinds].some((k) => AMBIENT.some((a) => a.id === k))).toBe(true);
    expect([...kinds].some((k) => !['partnership_offer', 'recruiter_poach'].includes(k) && MAIL_TEMPLATES.some((t) => t.id === k))).toBe(true);
  });

  it('on, a reply-all storm is a Yak gag: a replyall toast, lines in Yak and no mail', () => {
    B.pacing.letterMail = true;
    Object.assign(B.mail, { ambientChance: 0, actionChance: 0, replyAllChance: 1 });
    const s = company();
    const chatBefore = s.chatLog.length;
    const events = weeks(s, 4);
    expect(events.filter((e) => e.type === 'toast' && e.topic === 'replyall')).toEqual([
      { type: 'toast', text: 'Reply-all storm', tone: 'info', topic: 'replyall', subjectId: null, short: 'Reply-all storm' }]);
    expect(s.mail.some((m) => /^reply_all/.test(m.kind))).toBe(false);
    expect(s.chatLog.length - chatBefore).toBeGreaterThanOrEqual(2);
  });

  it('on, only letter events arrive as mail; inside events and notices go back to cards and toasts', () => {
    B.pacing.letterMail = true;
    expect(Object.keys(EVENT_MAIL).filter((id) => deliversAsMail(EVENTS[id])).sort()).toEqual(['app_store_rejection', 'blockchain_pitch']);
    B.pacing.letterMail = false;
    expect(Object.keys(EVENT_MAIL).filter((id) => deliversAsMail(EVENTS[id]))).toHaveLength(Object.keys(EVENT_MAIL).length);
  });
});
