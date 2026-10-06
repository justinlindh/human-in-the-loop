import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { B } from '../../src/sim/balance.js';
import { makeCtx } from '../../src/sim/registry.js';
import { eventChance, raiseDecision, eligibleEvents, eventsSystem, hasStakes, cardChance } from '../../src/sim/events.js';
import { postmortemSeverity } from '../../src/sim/incidents.js';
import { moonshotSystem } from '../../src/sim/moonshot.js';
import { promptChance } from '../../src/sim/prompts.js';
import { processScheduled } from '../../src/sim/effects.js';
import { STRUCTURAL_KEYS, structural } from '../../src/sim/value.js';
import { defaultChoiceOf } from '../../src/sim/asks.js';
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
let keepScripted;
let keepRates;
beforeEach(() => { keepPacing = { ...B.pacing }; keepMail = { ...B.mail }; keepScripted = { ...B.askRates.scriptedChance }; keepRates = { ...B.askRates }; });
afterEach(() => {
  Object.assign(B.pacing, keepPacing); Object.assign(B.mail, keepMail); Object.assign(B.askRates, keepRates);
  B.askRates.scriptedChance = Object.assign(keepRates.scriptedChance, keepScripted);
});

describe('askRates: fewer events and staff prompts come up', () => {
  it('on, random events roll as often as ever and only staff prompts roll less', () => {
    B.pacing.askRates = false;
    expect(eventChance()).toBe(B.randomEventChance);
    expect(promptChance()).toBe(B.chatPromptChance);
    B.pacing.askRates = true;
    expect(eventChance()).toBe(B.randomEventChance);
    expect(promptChance()).toBe(B.askRates.chatPromptChance);
    expect(B.askRates.chatPromptChance).toBeLessThan(B.chatPromptChance);
  });

  it('a choice that moves sensibleValue past stakesValue either way gives an event stakes', () => {
    const s = company();
    s.cash = 100000;
    expect(hasStakes(s, EVENTS.poached_by_bigco)).toBe(true);
    expect(hasStakes(s, { choices: [{ effects: { brand: 1 } }, { effects: {} }] })).toBe(false);
    expect(hasStakes(s, { choices: [{ effects: { brand: -2 } }, { effects: {} }] })).toBe(true);
  });

  it('on, a rolled event becomes a card at cardChance, three times that with stakes, and otherwise plays out quietly', () => {
    B.pacing.askRates = true;
    B.pacing.quietEvents = true;
    const s = company();
    const flat = { id: 'x', kind: 'staff', choices: [{ effects: { brand: 1 } }, { effects: {} }] };
    const stakes = { id: 'y', kind: 'staff', choices: [{ effects: { brand: -3 } }, { effects: {} }] };
    expect(cardChance(s, flat)).toBeCloseTo(B.askRates.cardChance);
    expect(cardChance(s, stakes)).toBeCloseTo(B.askRates.cardChance * B.askRates.stakesCardMult);
    expect(B.askRates.stakesCardMult).toBe(3);
    expect(cardChance(s, EVENTS.agent_db_wipe)).toBe(1);
    expect(cardChance(s, EVENTS.era_chatgbt)).toBe(1);
    B.askRates.cardChance = 0;
    s.flags.heldRolls = 2;
    const ctx = makeCtx(s);
    for (let i = 0; i < 40 && !ctx.events.some((e) => e.type === 'quietEvent'); i++) eventsSystem(ctx);
    expect(s.pendingDecision).toBeNull();
    expect(s.mail.filter((m) => !m.resolved)).toEqual([]);
    expect(ctx.events.some((e) => e.type === 'quietEvent')).toBe(true);
  });

  it('a follow-up scheduled by a quiet resolution rolls the card share too, and otherwise plays out quietly', () => {
    B.pacing.askRates = true;
    B.pacing.quietEvents = true;
    const followUp = (share) => {
      B.askRates.cardChance = share;
      const s = company();
      s.flags.lastDecisionWeek = s.week - 10;
      const ctx = makeCtx(s);
      const subject = s.staff.find((p) => !p.founder);
      raiseDecision(ctx, 'senior_side_project', subject.id, { quiet: true });
      s.scheduled.push({ id: 'sch_t', week: s.week, kind: 'event', payload: { eventId: 'no_show_again', subjectId: subject.id, quiet: true } });
      const later = makeCtx(s);
      processScheduled(later);
      return { s, events: later.events };
    };
    const quiet = followUp(0);
    expect(quiet.s.pendingDecision).toBeNull();
    expect(quiet.events).toContainEqual(expect.objectContaining({ type: 'quietEvent', eventId: 'no_show_again' }));
    expect(followUp(1).s.pendingDecision?.eventId).toBe('no_show_again');
  });

  it('a quiet resolution marks the follow-ups it schedules', () => {
    B.pacing.quietEvents = true;
    const s = company();
    EVENTS.__test_followup = { ...EVENTS.no_show, id: '__test_followup', quiet: true, defaultChoice: 0,
      choices: [{ label: 'Wait', effects: { followUp: { eventId: 'no_show_again', inWeeks: 10 } } }] };
    try {
      raiseDecision(makeCtx(s), '__test_followup', s.staff[1].id);
    } finally { delete EVENTS.__test_followup; }
    expect(s.scheduled.filter((x) => x.kind === 'event')).toEqual([expect.objectContaining({ payload: expect.objectContaining({ eventId: 'no_show_again', quiet: true }) })]);
  });

  it('no_show\'s ask default schedules no follow-up when it plays out quietly', () => {
    B.pacing.quietEvents = true;
    const s = company();
    s.cash = 100000;
    const c = EVENTS.no_show.choices[defaultChoiceOf(EVENTS.no_show)];
    expect(c.quietEffects.followUp).toBeUndefined();
    raiseDecision(makeCtx(s), 'no_show', s.staff[1].id, { quiet: true });
    expect(s.scheduled.filter((x) => x.kind === 'event')).toEqual([]);
    expect(s.staff[1].awayWeeks ?? s.staff[1].away?.weeks ?? 3).toBeGreaterThan(0);
  });

  it('structural effects: automation, models, policies, the NOC, pivots, people, exits, long modifiers and big cash', () => {
    const s = company();
    s.cash = 100000;
    for (const k of STRUCTURAL_KEYS) expect(structural(s, { [k]: 1 }), k).toBe(true);
    for (const k of ['setAutomation', 'automationBump', 'migrateOff', 'modelBoost', 'workPolicy', 'flag', 'nocMode', 'pivot', 'resign',
      'efficiencyCuts', 'candidates', 'aiInterview', 'win', 'openOffer', 'mission', 'purpose', 'moonshot']) expect(STRUCTURAL_KEYS, k).toContain(k);
    expect(structural(s, { modifier: { key: 'output', value: 0.1, weeks: 14 } })).toBe(true);
    expect(structural(s, { modifier: { key: 'output', value: 0.1, weeks: 13 } })).toBe(false);
    expect(structural(s, { cash: -11000 })).toBe(true);
    expect(structural(s, { cash: -9000 })).toBe(false);
    expect(structural(s, { later: [{ inWeeks: 3, effects: { pivot: true } }] })).toBe(true);
    expect(structural(s, { gamble: { p: 0.5, effects: { brand: 1 }, else: { resign: true } } })).toBe(true);
    expect(structural(s, { brand: 2, meaning: 5, teamMeaning: 1 })).toBe(false);
  });

  it('an event with a structural choice has stakes', () => {
    const s = company();
    s.cash = 100000;
    expect(hasStakes(s, { choices: [{ effects: { workPolicy: 'remote' } }, { effects: {} }] })).toBe(true);
  });

  it('a quietly played random event takes the careful player\'s best open choice and names it in Yak', () => {
    B.pacing.quietEvents = true;
    const s = company();
    s.cash = 100000;
    EVENTS.__test_best = { id: '__test_best', kind: 'staff', title: 'Test card', subject: null, defaultChoice: 1,
      choices: [{ label: 'Small thing', effects: { brand: 1 } }, { label: 'Nothing', effects: {} }, { label: 'Big thing', effects: { brand: 3 } }] };
    const ctx = makeCtx(s);
    try { raiseDecision(ctx, '__test_best', null, { quiet: true }); } finally { delete EVENTS.__test_best; }
    expect(ctx.events).toContainEqual(expect.objectContaining({ type: 'quietEvent', eventId: '__test_best', choice: 2 }));
    expect(s.chatLog.at(-1).text).toBe('Test card: "Big thing".');
  });

  it('when the best choice is structural, the quiet event takes the ask default instead', () => {
    B.pacing.quietEvents = true;
    const s = company();
    s.cash = 100000;
    EVENTS.__test_best = { id: '__test_best', kind: 'staff', title: 'Test card', subject: null, defaultChoice: 1,
      choices: [{ label: 'Pivot', effects: { brand: 5, pivot: true } }, { label: 'Nothing', effects: {} }, { label: 'Spend', effects: { brand: 4, cash: -50000 } }] };
    const ctx = makeCtx(s);
    try { raiseDecision(ctx, '__test_best', null, { quiet: true }); } finally { delete EVENTS.__test_best; }
    expect(ctx.events).toContainEqual(expect.objectContaining({ type: 'quietEvent', choice: 1 }));
  });

  it('off, a rolled event opens its card as today', () => {
    B.pacing.askRates = false;
    B.askRates.cardChance = 0;
    const s = company();
    expect(cardChance(s, { id: 'x', kind: 'staff', choices: [{ effects: {} }] })).toBe(1);
  });
});

describe('quietEvents: small events play out without a card', () => {
  const QUIET = ['ai_summit', 'ai_summit_hackathon', 'ai_summit_panel', 'conference_expo', 'four_day_week_review', 'incident_postmortem', 'music_night_genre', 'pet_mishap', 'ping_pong', 'printer_jam'];

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

  it('postmortems follow every severity 4 attack, with quietEvents on or off', () => {
    B.pacing.quietEvents = true;
    expect(postmortemSeverity()).toBe(4);
    B.pacing.quietEvents = false;
    expect(postmortemSeverity()).toBe(4);
  });

  it('on, a postmortem is filed quietly: the write-up, a line in #incidents and a quietEvent, with no card', () => {
    B.pacing.quietEvents = true;
    B.pacing.askQueue = true;
    const s = company();
    const responder = s.staff[1];
    const knowledge = responder.knowledge;
    s.flags.postmortemQueue = [{ eventId: 'incident_postmortem', week: s.week, kind: 'ransomware', label: 'ransomware', productId: s.products[0].id,
      severity: 4, weeks: 2, cost: { cash: 0, brand: 0, customers: 0 }, responderIds: [responder.id], helped: [], hurt: [] }];
    const ctx = makeCtx(s);
    expect(raiseDecision(ctx, 'incident_postmortem', s.products[0].id, { queue: true })).toBe(true);
    expect(s.pendingDecision).toBeNull();
    expect(s.asks).toEqual([]);
    expect(s.flags.postmortemQueue).toEqual([]);
    expect(responder.knowledge).toBe(Math.min(100, knowledge + B.postmortemKnowledge));
    expect(ctx.events).toContainEqual(expect.objectContaining({ type: 'quietEvent', eventId: 'incident_postmortem', choice: 0 }));
    const line = s.chatLog.at(-1);
    expect(line).toMatchObject({ channel: 'incidents', text: 'Postmortem filed: ransomware. Lessons learned, allegedly.' });
  });

  it('off, a postmortem opens its card as before', () => {
    B.pacing.quietEvents = false;
    const s = company();
    raiseDecision(makeCtx(s), 'incident_postmortem', s.products[0].id);
    expect(s.pendingDecision?.eventId).toBe('incident_postmortem');
  });
});

describe('askRates: the acquisition offer is a scripted beat', () => {
  const ready = () => {
    const s = company();
    s.week = B.retireFromWeek + 10;
    s.brand = 100;
    s.products[0].mrr = 1e7;
    return s;
  };

  it('on, a ready offer rolls its own weekly chance: never at 0, and at the chance main\'s random pool gives a ready offer', () => {
    B.pacing.askRates = true;
    expect(B.askRates.scriptedChance.acquisition_offer).toBeGreaterThan(0.005);
    expect(B.askRates.scriptedChance.acquisition_offer).toBeLessThan(0.03);
    B.askRates.scriptedChance.acquisition_offer = 0;
    const s = ready();
    for (let i = 0; i < 60; i++) {
      eventsSystem(makeCtx(s));
      expect(s.pendingDecision?.eventId).not.toBe('acquisition_offer');
      s.pendingDecision = null;
      s.week++;
    }
  });

  it('on, the offer leaves the random pool and comes once offerReady holds, then not again for its cooldown', () => {
    B.pacing.askRates = true;
    B.askRates.scriptedChance.acquisition_offer = 1;
    const s = ready();
    expect(eligibleEvents(s).some((e) => e.id === 'acquisition_offer')).toBe(false);
    eventsSystem(makeCtx(s));
    expect(s.pendingDecision?.eventId).toBe('acquisition_offer');
    s.pendingDecision = null;
    s.week += 51;
    delete s.flags.lastPauseWeek;
    delete s.flags.lastDecisionWeek;
    eventsSystem(makeCtx(s));
    expect(s.pendingDecision?.eventId).not.toBe('acquisition_offer');
  });

  it('off, the offer stays a random event', () => {
    B.pacing.askRates = false;
    expect(eligibleEvents(ready()).some((e) => e.id === 'acquisition_offer')).toBe(true);
  });

  it('the offer never expires', () => {
    expect(EVENTS.acquisition_offer.noExpire).toBe(true);
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
