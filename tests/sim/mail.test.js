import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { dispatch } from '../../src/sim/index.js';
import { makeCtx } from '../../src/sim/registry.js';
import { mailSystem, openChoice } from '../../src/sim/mail.js';
import { fireEvent, resolveSubjects } from '../../src/sim/events.js';
import { saveGame, loadGame } from '../../src/save/save.js';
import { B } from '../../src/sim/balance.js';
import { EVENTS } from '../../src/data/events.js';
import { AMBIENT, MAIL_TEMPLATES, EVENT_MAIL, REPLY_ALL } from '../../src/data/mail.js';
import { eraAllowsText } from '../../src/sim/eras.js';
import { botTurn } from '../../src/sim/bots.js';
import { game, addStaff, addDesks, addProduct, expectFail } from './helpers.js';

// These cases cover the full inbox; letterMail's letters-only inbox has its own tests in pacing-rates.test.js.
let keepLetterMail;
beforeEach(() => { keepLetterMail = B.pacing.letterMail; B.pacing.letterMail = false; });
afterEach(() => { B.pacing.letterMail = keepLetterMail; });

const CATEGORIES = ['applicant', 'partner', 'customer', 'vendor', 'recruiter', 'investor', 'invite', 'legal', 'rival', 'staff', 'spam'];
const MOVED_CHOICES = ['alumni_referral', 'blockchain_pitch', 'vendor_new_version', 'app_store_rejection'];
const MOVED_NOTICES = ['vendor_price_hike', 'analyst_report', 'vendor_outage', 'bootcamp_grads'];

// A settled company with people, a live product and a rival.
function company(seed = 1) {
  const s = game(seed);
  s.week = 60;
  addDesks(s, 6);
  for (let i = 0; i < 4; i++) addStaff(s, 'engineer', 'mid', { hiredWeek: 0 });
  for (const p of s.staff) { p.mood = 'ok'; p.strain = 0; p.meaning = 60; }
  addProduct(s, { name: 'Ledgerly', customers: 300, mrr: 6000 });
  s.stats.launches = 1;
  s.rival = { name: 'Copycat Inc', founderName: 'Skip', status: 'rising' };
  return s;
}
const weekOf = (s) => { const ctx = makeCtx(s); mailSystem(ctx); return ctx.events; };
function runWeeks(s, n) {
  const events = [];
  for (let i = 0; i < n; i++) { events.push(...weekOf(s)); s.week++; }
  return events;
}
const mailOf = (s, kind) => s.mail.find((m) => m.kind === kind);
// Opens one actionable template mail of this kind by forcing the roll.
function openTemplate(s, kind) {
  const keep = { amb: B.mail.ambientChance, act: B.mail.actionChance, ra: B.mail.replyAllChance };
  Object.assign(B.mail, { ambientChance: 0, actionChance: 1, replyAllChance: 0 });
  try {
    for (const t of MAIL_TEMPLATES) s.flags[`mcd_${t.id}`] = t.id === kind ? 0 : 1e9;
    weekOf(s);
  } finally { Object.assign(B.mail, { ambientChance: keep.amb, actionChance: keep.act, replyAllChance: keep.ra }); }
  const m = mailOf(s, kind);
  if (!m) throw new Error(`no ${kind} mail`);
  return m;
}

let enabled;
beforeEach(() => { enabled = B.mail.enabled; B.mail.enabled = true; });
afterEach(() => { B.mail.enabled = enabled; });

describe('issue #17: the inbox', () => {
  it('is on by default, and while off nothing arrives and the moved events behave as before', () => {
    expect(enabled).toBe(true);
    B.mail.enabled = false;
    const s = company();
    expect(runWeeks(s, 60).filter((e) => e.type === 'mail')).toEqual([]);
    expect(s.mail).toEqual([]);
    const ctx = makeCtx(s);
    expect(fireEvent(ctx, EVENTS.vendor_price_hike, null)).toBe(true);
    expect(ctx.events.some((e) => e.type === 'toast')).toBe(true);
    expect(s.mail).toEqual([]);
  });

  it('data: categories, eras, short subjects, options with hints, and no AI spam before ChatGBT', () => {
    for (const t of [...AMBIENT, ...MAIL_TEMPLATES]) {
      expect(CATEGORIES, t.id).toContain(t.category);
      expect(t.from.length, t.id).toBeGreaterThan(0);
      for (const sub of t.subject) expect(sub.length, sub).toBeLessThanOrEqual(70);
    }
    for (const t of AMBIENT) expect(t.options, t.id).toBeUndefined();
    for (const t of MAIL_TEMPLATES) {
      expect(t.options.length, t.id).toBeGreaterThanOrEqual(2);
      for (const o of t.options) { expect(o.hint, t.id).toBeTruthy(); expect(o.reply, t.id).toBeTruthy(); }
      expect(t.ignored.effects.resign, t.id).toBeUndefined();
    }
    const classic = { era: { id: 'classic' } };
    for (const t of AMBIENT.filter((x) => !x.eras || x.eras.includes('classic'))) for (const b of t.body) expect(eraAllowsText(classic, b), `${t.id}: ${b}`).toBe(true);
    expect(AMBIENT.find((t) => t.id === 'spam_ai_outreach').eras).not.toContain('classic');
    for (const id of [...MOVED_CHOICES, ...MOVED_NOTICES]) {
      expect(EVENTS[id], id).toBeTruthy();
      expect(EVENTS[id].stage, id).toBeUndefined();
      expect(EVENT_MAIL[id], id).toBeTruthy();
    }
    for (const id of MOVED_CHOICES) expect(EVENTS[id].choices[EVENT_MAIL[id].ignore], id).toBeTruthy();
    for (const id of Object.keys(EVENT_MAIL)) expect(CATEGORIES, id).toContain(EVENT_MAIL[id].category);
    expect(EVENT_MAIL.analyst_report.category).toBe('partner');
    for (const id of MOVED_NOTICES) expect(EVENTS[id].choices, id).toBeUndefined();
    expect(Object.keys(EVENT_MAIL).sort()).toEqual([...MOVED_CHOICES, ...MOVED_NOTICES].sort());
  });

  it('a long run: well-formed mail, at most one ambient a week, open choices within the cap, spam inert, JSON-safe', () => {
    const s = company(3);
    const events = runWeeks(s, 300);
    const arrived = events.filter((e) => e.type === 'mail');
    expect(arrived.length).toBeGreaterThan(40);
    const byWeek = {};
    for (const e of arrived) {
      const m = s.mail.find((x) => x.id === e.mailId);
      if (m && m.category !== 'staff' && !m.options.length) byWeek[e.week] = (byWeek[e.week] ?? 0) + 1;
    }
    expect(Math.max(...Object.values(byWeek))).toBe(1);
    expect(s.mail.filter(openChoice).length).toBeLessThanOrEqual(B.mail.actionOpen);
    expect(s.mail.length).toBeLessThanOrEqual(B.mail.kept);
    for (const m of s.mail) {
      expect(CATEGORIES).toContain(m.category);
      expect(m.id).toMatch(/^m\d+$/);
      expect(typeof m.subject).toBe('string');
      expect(m.body).not.toMatch(/\{\w+\}/);
      expect(m.subject).not.toMatch(/\{\w+\}/);
      expect(m.to).toMatch(/@/);
      if (m.category === 'spam') expect(m.options).toEqual([]);
      if (m.options.length && m.kind !== 'reply_all') expect(m.important).toBe(true);
    }
    expect(JSON.parse(JSON.stringify(s.mail))).toEqual(s.mail);
    expect(Number.isFinite(s.cash)).toBe(true);
  });

  it('answerMail applies the reply, refuses bad answers, and readMail is idempotent', () => {
    const s = company();
    const m = openTemplate(s, 'customer_complaint');
    expect(m.options.map((o) => o.label)).toEqual(['Refund and apologise', 'Ship a fix']);
    expect(m.expiresWeek).toBe(s.week + B.mail.expiryWeeks);
    expectFail(expect, dispatch, s, { type: 'answerMail', mailId: 'm999', choice: 0 }, 'No such mail');
    expectFail(expect, dispatch, s, { type: 'answerMail', mailId: m.id, choice: 5 }, 'Invalid choice');
    expect(dispatch(s, { type: 'readMail', mailId: m.id }).ok).toBe(true);
    const readWeek = m.read;
    s.week++;
    dispatch(s, { type: 'readMail', mailId: m.id });
    expect(m.read).toBe(readWeek);
    const cash = s.cash;
    const brand = s.brand;
    const unread = openTemplate(s, 'partnership_offer');
    expect(dispatch(s, { type: 'answerMail', mailId: unread.id, choice: 1 }).ok).toBe(true);
    expect(unread.read).toBe(null);
    expect(dispatch(s, { type: 'answerMail', mailId: m.id, choice: 0 }).ok).toBe(true);
    expect(s.cash).toBe(cash - B.mail.refund);
    expect(s.brand).toBe(Math.min(100, brand + B.mail.refundBrand));
    expect(m.resolved).toEqual({ choice: 0, week: s.week, replyText: expect.any(String) });
    expectFail(expect, dispatch, s, { type: 'answerMail', mailId: m.id, choice: 1 }, 'Already answered');
  });

  it('ignoring template mail takes its stated consequence when it expires or is archived, never a departure', () => {
    const s = company();
    const m = openTemplate(s, 'customer_complaint');
    const brand = s.brand;
    s.week = m.expiresWeek;
    const ev = weekOf(s);
    expect(ev).toContainEqual({ type: 'mailResolved', mailId: m.id, choice: null });
    expect(s.brand).toBe(brand + B.mail.complaintIgnoredBrand);
    expectFail(expect, dispatch, s, { type: 'answerMail', mailId: m.id, choice: 0 }, 'That has gone quiet');

    const t = company(2);
    const poach = openTemplate(t, 'recruiter_poach');
    const who = t.staff.find((p) => p.id === poach.subjectId);
    const staff = t.staff.length;
    expect(dispatch(t, { type: 'archiveMail', mailId: poach.id }).ok).toBe(true);
    expect(poach.archived).toBe(true);
    expect(poach.resolved.choice).toBe(null);
    expect(who.strain).toBe(B.mail.poachIgnoredStrain);
    expect(t.staff.length).toBe(staff);
  });

  it('a job application adds one candidate; a raise counter-offer lands on the poached person', () => {
    const s = company();
    const before = s.candidates.length;
    const app = openTemplate(s, 'job_application');
    dispatch(s, { type: 'answerMail', mailId: app.id, choice: 0 });
    expect(s.candidates.length).toBe(Math.min(8, before + 1));

    const t = company(4);
    const poach = openTemplate(t, 'recruiter_poach');
    const who = t.staff.find((p) => p.id === poach.subjectId);
    const salary = who.salary;
    dispatch(t, { type: 'answerMail', mailId: poach.id, choice: 1 });
    expect(who.salary).toBe(Math.round((salary * (1 + B.mail.poachRaisePct / 100)) / 10) * 10);
  });

  it('choice events arrive as answerable mail and take their mildest choice when ignored; notices keep their effects', () => {
    const s = company();
    s.flags.alumni = [{ name: 'Rosa Diaz' }];
    const ctx = makeCtx(s);
    expect(fireEvent(ctx, EVENTS.alumni_referral, null)).toBe(true);
    expect(s.pendingDecision).toBe(null);
    const m = mailOf(s, 'alumni_referral');
    expect(m.from.name).toBe('Rosa');
    expect(m.options).toHaveLength(EVENTS.alumni_referral.choices.length);
    const before = s.candidates.length;
    s.week = m.expiresWeek;
    weekOf(s);
    expect(m.resolved.choice).toBe(null);
    expect(s.candidates.length).toBeGreaterThan(before);
    const follow = s.mail.find((x) => x.inReplyTo === m.id);
    expect(follow.body).toMatch(/^Nobody answered, so: /);
    expect(follow.from).toEqual(m.from);

    const u = company();
    const founder = u.staff.find((p) => p.founder).id;
    expect(fireEvent(makeCtx(u), EVENTS.blockchain_pitch, founder)).toBe(true);
    const pitch = mailOf(u, 'blockchain_pitch');
    dispatch(u, { type: 'answerMail', mailId: pitch.id, choice: 0 });
    const outcome = u.mail.find((x) => x.inReplyTo === pitch.id);
    expect(outcome.threadId).toBe(pitch.id);
    expect(outcome.subject).toBe(`Re: ${pitch.subject}`);
    expect(outcome.body).toBe(EVENTS.blockchain_pitch.choices[0].outcome);
    expect(outcome.options).toEqual([]);

    const t = company();
    const vendor = resolveSubjects(t, EVENTS.vendor_price_hike);
    const ctx2 = makeCtx(t);
    expect(fireEvent(ctx2, EVENTS.vendor_price_hike, vendor[0] ?? null)).toBe(true);
    expect(ctx2.events.some((e) => e.type === 'toast' && /pricing/i.test(e.text))).toBe(false);
    const notice = mailOf(t, 'vendor_price_hike');
    expect(notice.options).toEqual([]);
    expect(notice.expiresWeek).toBe(null);
    expect(notice.subject).toBe(EVENTS.vendor_price_hike.title);
  });

  it('a choice event waits when the open-mail slots are full', () => {
    const s = company();
    openTemplate(s, 'customer_complaint');
    openTemplate(s, 'partnership_offer');
    expect(s.mail.filter(openChoice)).toHaveLength(B.mail.actionOpen);
    expect(fireEvent(makeCtx(s), EVENTS.blockchain_pitch, s.staff.find((p) => p.founder).id)).toBe(false);
  });

  it('a reply-all storm grows each week, replying all keeps it going and dips output, muting ends it', () => {
    const s = company();
    const keep = B.mail.replyAllChance;
    B.mail.replyAllChance = 1;
    try { weekOf(s); } finally { B.mail.replyAllChance = keep; }
    const root = mailOf(s, 'reply_all');
    expect(root.to).toMatch(/^(everyone|all-staff)@/);
    expect(root.options.map((o) => o.label)).toEqual(REPLY_ALL.options.map((o) => o.label));
    s.week++;
    weekOf(s);
    expect(s.mail.filter((m) => m.threadId === root.id && m.inReplyTo === root.id).length).toBeGreaterThan(0);
    dispatch(s, { type: 'answerMail', mailId: root.id, choice: 0 });
    expect(s.flags.replyAllSent).toBe(1);
    expect(s.modifiers.some((m) => m.label === 'Reply-all storm')).toBe(true);
    expect(s.mail.some((m) => m.threadId === root.id && m.from.staffId === s.staff.find((p) => p.founder).id)).toBe(true);

    const t = company(5);
    B.mail.replyAllChance = 1;
    try { weekOf(t); } finally { B.mail.replyAllChance = keep; }
    const root2 = mailOf(t, 'reply_all');
    dispatch(t, { type: 'answerMail', mailId: root2.id, choice: 1 });
    t.week++;
    weekOf(t);
    expect(t.flags.replyAll).toBeUndefined();
  });

  it('mail kinds of its own never reuse an event id, since event mail is known by its kind', () => {
    const own = [...AMBIENT, ...MAIL_TEMPLATES].map((t) => t.id).concat('reply_all', 'reply_all_reply', ...Object.keys(EVENT_MAIL).map((id) => `${id}_outcome`));
    for (const id of own) expect(EVENTS[id], id).toBeUndefined();
    expect(new Set(own).size).toBe(own.length);
    for (const id of Object.keys(EVENT_MAIL)) expect(EVENTS[id], id).toBeDefined();
  });

  it('bots keep different inbox habits: some answer at once, one answers late, one never does', () => {
    const habit = (name) => {
      const s = company();
      const m = openTemplate(s, 'vendor_pitch');
      const answeredAt = [];
      for (let i = 0; i < B.mail.expiryWeeks + 1 && !m.resolved; i++) {
        botTurn(name, s);
        if (m.resolved) answeredAt.push(s.week - m.week);
        s.week++;
        if (!m.resolved) { const ctx = makeCtx(s); mailSystem(ctx); }
      }
      return { resolved: m.resolved, after: answeredAt[0] };
    };
    expect(habit('sensible')).toMatchObject({ after: 0 });
    expect(habit('sensible').resolved.choice).not.toBeNull();
    expect(habit('automateAll').after).toBe(B.mail.botLateWeeks);
    const never = habit('recklessHumans');
    expect(never.after).toBeUndefined();
    expect(never.resolved.choice).toBeNull();
  });

  it('saves and loads the inbox, and an old save without one loads with an empty inbox', () => {
    const s = company();
    openTemplate(s, 'customer_complaint');
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
    saveGame(s, storage);
    expect(loadGame(storage).state.mail).toEqual(s.mail);
    delete s.mail;
    saveGame(s, storage);
    expect(loadGame(storage).state.mail).toEqual([]);
  });
});
