import { B } from './balance.js';
import { createRng, chance, pick, int } from './rng.js';
import { registerAction, registerSystem } from './registry.js';
import { applyEffects, checkCondition, requireReason } from './effects.js';
import { emitChat } from './chat.js';
import { eraAllowsText, currentEra } from './eras.js';
import { liveProducts } from './projects.js';
import { decisionVars, fillText } from './events.js';
import { grantBlocker } from './props.js';
import { askQueueOn, queueTemplateLetter } from './asks.js';
import { AMBIENT, MAIL_TEMPLATES, EVENT_MAIL, REPLY_ALL, typoName } from '../data/mail.js';
import { EVENTS } from '../data/events.js';
import { MODELS } from '../data/models.js';

// The inbox: letters from outside the company. Mail never pauses the clock and never opens a popup. Three
// sources: ambient mail (spam and the outside world, read-only), actionable templates (small choices with a
// stated consequence for ignoring them), and low-stakes events delivered as mail instead of a popup or a toast.
// A reply-all storm is the running joke: an all-company thread that grows until someone mutes it.
// What a mail is about (its product, its staff member, an event's placeholder values) lives in flags.mailCtx
// by mail id until it resolves.

// Mail draws from its own stream, seeded from the game seed, the week and the mail sequence, so with
// B.mail.enabled false a seeded game plays exactly as it would without the inbox.
function side(ctx, salt) {
  const { state } = ctx;
  const seq = state.flags.mailSeq ?? 0;
  return { ...ctx, rng: createRng(((state.seed >>> 0) * 6151 + state.week * 389 + seq * 7213 + salt) >>> 0) };
}

const TEMPLATES = Object.fromEntries(MAIL_TEMPLATES.map((t) => [t.id, t]));
const REPLY_ALL_KIND = REPLY_ALL.id;
const present = (state) => state.staff.filter((p) => p.mood !== 'away');
const founderOf = (state) => present(state).find((p) => p.founder) ?? state.staff.find((p) => p.founder) ?? null;
export const openChoice = (m) => m.options.length > 0 && !m.resolved;
const openCount = (state) => (state.mail ?? []).filter(openChoice).length;
export const mailSlotFree = (state) => openCount(state) < B.mail.actionOpen;
const slug = (name) => String(name).toLowerCase().replace(/[^a-z0-9]/g, '') || 'company';
const importantFor = (category, options) => options.length > 0 || category === 'legal' || category === 'investor';

// Fills a mail's placeholders; null when one it needs has no value here.
function fill(state, text, mc) {
  const product = state.products.find((p) => p.id === mc.productId);
  const staff = state.staff.find((p) => p.id === mc.staffId);
  const values = {
    company: state.companyName, companySlug: slug(state.companyName), companyTypo: typoName(state.companyName), product: product?.name, staff: staff?.name.split(' ')[0],
    rival: state.rival?.name, rivalFounder: state.rival?.founderName, model: mc.model, org: mc.org, subjectLine: mc.subjectLine,
  };
  let missing = false;
  const out = String(text).replace(/\{(\w+)\}/g, (_, k) => { if (!values[k]) missing = true; return values[k] ?? ''; });
  return missing ? null : out;
}

// The first variant that fills and fits the era, from a random starting point.
function pickText(ctx, lines, mc) {
  const start = int(ctx.rng, 0, lines.length - 1);
  for (let i = 0; i < lines.length; i++) {
    const t = fill(ctx.state, lines[(start + i) % lines.length], mc);
    if (t && eraAllowsText(ctx.state, t)) return t;
  }
  return null;
}

const releasedModels = (state) => Object.keys(MODELS).filter((id) => state.models?.[id]?.available && !state.models[id].deprecated);

// What a template or ambient mail needs this week, as its context; null when it can't arrive.
function contextFor(ctx, t) {
  const { state } = ctx;
  if (t.eras && !t.eras.includes(currentEra(state).id)) return null;
  if (t.minWeek && state.week < t.minWeek) return null;
  const mc = { kind: t.id, productId: null, staffId: null, model: null };
  if (t.needs === 'product' || t.about === 'product') {
    const live = liveProducts(state);
    if (!live.length) return null;
    mc.productId = pick(ctx.rng, live).id;
  }
  if ((t.needs === 'preseed' || t.needs === 'family') && (state.founding?.funding ?? 'bootstrapped') !== t.needs) return null;
  if (t.needs === 'rival' && !(state.rival && ['rising', 'stalled'].includes(state.rival.status))) return null;
  if (t.needs === 'staff') {
    const staff = present(state).filter((p) => !p.founder && p.seniority !== 'junior');
    if (!staff.length) return null;
    mc.staffId = pick(ctx.rng, staff).id;
  }
  if (t.about === 'founder') mc.staffId = founderOf(state)?.id ?? null;
  const models = releasedModels(state);
  if (models.length) mc.model = MODELS[pick(ctx.rng, models)].name;
  return mc;
}

// At most B.mail.kept mails, oldest dropped first; mail with an open choice is never dropped.
function prune(state) {
  while (state.mail.length > B.mail.kept) {
    const i = state.mail.findLastIndex((m) => !openChoice(m));
    if (i < 0) break;
    const [gone] = state.mail.splice(i, 1);
    delete state.flags.mailCtx?.[gone.id];
  }
}

// Adds a mail (newest first) and announces it.
function addMail(ctx, m) {
  const { state } = ctx;
  state.flags.mailSeq = (state.flags.mailSeq ?? 0) + 1;
  const id = `m${state.flags.mailSeq}`;
  const options = m.options ?? [];
  const mail = {
    id, kind: m.kind, week: state.week,
    from: { name: m.from.name, org: m.from.org ?? null, staffId: m.from.staffId ?? null },
    to: m.to ?? `founders@${slug(state.companyName)}.com`,
    category: m.category, subject: m.subject, body: m.body,
    important: m.important ?? importantFor(m.category, options),
    threadId: m.threadId ?? id, inReplyTo: m.inReplyTo ?? null,
    read: null,
    expiresWeek: options.length ? state.week + (m.expiryWeeks ?? B.mail.expiryWeeks) : null,
    options, resolved: null, archived: false,
    subjectId: m.subjectId ?? null,
  };
  state.mail.unshift(mail);
  if (m.mc) (state.flags.mailCtx ??= {})[id] = m.mc;
  ctx.emit({ type: 'mail', mailId: id, week: state.week });
  prune(state);
  return mail;
}

function sender(ctx, t, mc) {
  const start = int(ctx.rng, 0, t.from.length - 1);
  for (let i = 0; i < t.from.length; i++) {
    const f = t.from[(start + i) % t.from.length];
    const name = fill(ctx.state, f.name, mc);
    const org = f.org ? fill(ctx.state, f.org, mc) : null;
    if (name && (org || !f.org)) return { name, org };
  }
  return null;
}

function compose(ctx, t, mc) {
  const from = sender(ctx, t, mc);
  if (!from) return null;
  mc.org = from.org;
  const subject = pickText(ctx, t.subject, mc);
  const body = pickText(ctx, t.body, mc);
  return subject && body ? { from, subject, body } : null;
}

function ambient(ctx) {
  const fits = AMBIENT.map((t) => ({ t, mc: contextFor(ctx, t) })).filter((x) => x.mc);
  if (!fits.length) return;
  const { t, mc } = pick(ctx.rng, fits);
  const made = compose(ctx, t, mc);
  if (!made) return;
  addMail(ctx, { kind: t.id, category: t.category, ...made });
}

function optionsFor(state, t, mc) {
  return t.options.map((o) => ({ label: fill(state, o.label, mc) ?? o.label, hint: fill(state, o.hint, mc) ?? o.hint, available: true, reason: null }));
}

function actionable(ctx) {
  const { state } = ctx;
  const fits = MAIL_TEMPLATES.filter((t) => (state.flags[`mcd_${t.id}`] ?? -1) <= state.week)
    .map((t) => ({ t, mc: contextFor(ctx, t) })).filter((x) => x.mc);
  if (!fits.length) return;
  const { t, mc } = pick(ctx.rng, fits);
  if (askQueueOn()) {
    state.flags[`mcd_${t.id}`] = state.week + B.mail.templateCooldown;
    queueTemplateLetter(ctx, t.id, mc);
    return;
  }
  sendTemplate(ctx, t.id, mc);
}

// Writes and delivers a template letter for its context; false when it no longer fits.
export function sendTemplate(ctx, templateId, mc) {
  const { state } = ctx;
  const t = TEMPLATES[templateId];
  const made = compose(ctx, t, mc);
  if (!made) return false;
  state.flags[`mcd_${t.id}`] = state.week + B.mail.templateCooldown;
  addMail(ctx, { kind: t.id, category: t.category, important: t.important, ...made, options: optionsFor(state, t, mc), mc,
    subjectId: t.about === 'staff' ? mc.staffId : null });
  return true;
}

// A template letter nobody opened: its ignore outcome.
export function expireTemplate(ctx, templateId, mc) {
  const t = TEMPLATES[templateId];
  applyEffects(ctx, t.ignored.effects, aboutId(t, mc), `mail:${t.id}`);
}

// Events delivered as mail. A choice event becomes answerable mail (its mildest choice, EVENT_MAIL.ignore,
// applies when nobody answers); a notice keeps its effects and the stream it drew them from, and becomes
// read-only mail instead of a toast.
export const eventChoiceBlocker = (state, c, subjectId) =>
  (c.requires && !checkCondition(state, c.requires, subjectId) ? requireReason(state, c.requires) : grantBlocker(state, c));

export const deliversAsMail = (ev) => B.mail.enabled && !!EVENT_MAIL[ev.id] && !ev.stage;

// A notice's title and text are filled by the caller exactly as its toast would have been.
export function mailEventNotice(ctx, ev, title, text, subjectId) {
  const meta = EVENT_MAIL[ev.id];
  const { state } = ctx;
  state.mail ??= [];
  addMail(ctx, { kind: ev.id, category: meta.category, important: meta.important, from: meta.from,
    subject: title, body: text, subjectId: state.staff.some((p) => p.id === subjectId) ? subjectId : null });
}

export function openEventMail(outer, ev, subjectId) {
  const ctx = side(outer, 2);
  const { state } = ctx;
  state.mail ??= [];
  const meta = EVENT_MAIL[ev.id];
  const vars = decisionVars(state, ctx.rng, subjectId);
  const fill2 = (t) => fillText(state, ctx.rng, t, subjectId, vars);
  addMail(ctx, {
    kind: ev.id, category: meta.category, important: true,
    from: { name: fill2(meta.from.name), org: meta.from.org }, subject: fill2(ev.title), body: fill2(ev.text),
    options: ev.choices.map((c) => { const why = eventChoiceBlocker(state, c, subjectId); return { label: fill2(c.label), hint: fill2(c.hint), available: !why, reason: why }; }),
    mc: { kind: ev.id, event: true, subjectId, vars },
    subjectId: state.staff.some((p) => p.id === subjectId) ? subjectId : null,
  });
  if (ev.marks) state.flags[ev.marks] = state.week;
}

function resolveEvent(ctx, mail, choice) {
  const { state } = ctx;
  const ev = EVENTS[mail.kind];
  const mc = state.flags.mailCtx?.[mail.id] ?? { subjectId: null, vars: null };
  const fill2 = (t) => fillText(state, ctx.rng, t, mc.subjectId, mc.vars);
  const index = choice ?? EVENT_MAIL[ev.id].ignore;
  let replyText = null;
  if (index !== null && index !== undefined) {
    const c = ev.choices[index];
    if (choice !== null) replyText = fill2(c.label);
    if (choice !== null || !eventChoiceBlocker(state, c, mc.subjectId)) {
      applyEffects(ctx, c.effects, mc.subjectId, ev.id, mc.vars);
      // The outcome arrives as the sender's follow-up in the thread, the way a popup toasts it.
      if (c.outcome) {
        addMail(ctx, { kind: `${ev.id}_outcome`, category: mail.category, from: mail.from, subject: `Re: ${mail.subject}`,
          body: choice === null ? `Nobody answered, so: ${fill2(c.outcome)}` : fill2(c.outcome), threadId: mail.id, inReplyTo: mail.id, important: false });
      }
    }
  }
  return replyText;
}

// The thing a template's effects land on: its staff member or founder, or its product.
const aboutId = (t, mc) => (t.about === 'product' ? mc.productId : t.about ? mc.staffId : null);

function resolveTemplate(ctx, mail, choice) {
  const { state } = ctx;
  const t = TEMPLATES[mail.kind];
  const mc = state.flags.mailCtx?.[mail.id] ?? { kind: mail.kind };
  if (choice === null) { applyEffects(ctx, t.ignored.effects, aboutId(t, mc), `mail:${t.id}`); return null; }
  const o = t.options[choice];
  applyEffects(ctx, o.effects, aboutId(t, mc), `mail:${t.id}`);
  const person = state.staff.find((p) => p.id === mc.staffId);
  if (o.line && person && t.about === 'staff') emitChat(ctx, { channel: 'general', person, text: pick(ctx.rng, o.line), mailId: mail.id });
  return fill(state, o.reply, mc) ?? o.reply;
}

function resolve(ctx, mail, choice) {
  const { state } = ctx;
  const replyText = mail.kind === REPLY_ALL_KIND ? resolveReplyAll(ctx, mail, choice)
    : TEMPLATES[mail.kind] ? resolveTemplate(ctx, mail, choice) : resolveEvent(ctx, mail, choice);
  mail.resolved = { choice, week: state.week, replyText };
  delete state.flags.mailCtx?.[mail.id];
  ctx.emit({ type: 'mailResolved', mailId: mail.id, choice });
}

// The reply-all storm.
function staffSender(state, person) {
  return { name: person.name, org: state.companyName, staffId: person.id };
}

function startReplyAll(ctx) {
  const { state } = ctx;
  const staff = present(state).filter((p) => !p.founder);
  if (staff.length < 3) return;
  const agents = ['agents', 'consolidation', 'plateau'].includes(currentEra(state).id) && (state.automation?.engineering?.level ?? 0) > 0;
  const subjectLine = pick(ctx.rng, agents ? REPLY_ALL.agentSubjects : REPLY_ALL.subjects);
  const starter = pick(ctx.rng, staff);
  const from = agents ? { name: 'Office Agent', org: state.companyName } : staffSender(state, starter);
  const to = fill(state, pick(ctx.rng, REPLY_ALL.to), {});
  const root = addMail(ctx, {
    kind: REPLY_ALL_KIND, category: 'staff', from, to, subject: subjectLine, body: fill(state, pick(ctx.rng, REPLY_ALL.root), { subjectLine }),
    options: REPLY_ALL.options.map((o) => ({ label: o.label, hint: o.hint, available: true, reason: null })),
    expiryWeeks: B.mail.replyAllWeeks, important: false,
  });
  state.flags.replyAll = { rootId: root.id, until: state.week + B.mail.replyAllWeeks, agents, to };
  state.flags.replyAllNext = state.week + B.mail.replyAllCooldown;
  if ((state.flags.replyAllSent ?? 0) >= 3) emitChat(ctx, { channel: 'random', person: starter, text: pick(ctx.rng, REPLY_ALL.callback), mailId: root.id });
}

function growReplyAll(ctx) {
  const { state } = ctx;
  const storm = state.flags.replyAll;
  const root = state.mail.find((m) => m.id === storm.rootId);
  if (!root || state.week >= storm.until) { delete state.flags.replyAll; return; }
  const staff = present(state).filter((p) => !p.founder);
  for (let i = int(ctx.rng, 1, 2); i > 0 && staff.length; i--) {
    const who = pick(ctx.rng, staff);
    const lines = storm.agents && chance(ctx.rng, 0.3) ? REPLY_ALL.agentReplies : REPLY_ALL.replies;
    addMail(ctx, { kind: 'reply_all_reply', category: 'staff', from: staffSender(state, who), to: storm.to,
      subject: `Re: ${root.subject}`, body: pick(ctx.rng, lines), threadId: root.id, inReplyTo: root.id, important: false });
  }
}

function resolveReplyAll(ctx, mail, choice) {
  const { state } = ctx;
  const storm = state.flags.replyAll;
  if (choice === 0) {
    const founder = founderOf(state);
    if (founder) {
      addMail(ctx, { kind: 'reply_all_reply', category: 'staff', from: staffSender(state, founder), to: mail.to,
        subject: `Re: ${mail.subject}`, body: REPLY_ALL.options[0].reply, threadId: mail.id, inReplyTo: mail.id, important: false });
    }
    state.flags.replyAllSent = (state.flags.replyAllSent ?? 0) + 1;
    applyEffects(ctx, { modifier: { key: 'output', value: B.mail.replyAllOutput, weeks: 1, label: 'Reply-all storm' } }, null, 'mail:reply_all');
    if (storm?.rootId === mail.id) storm.until = Math.max(storm.until, state.week + 2);
    return REPLY_ALL.options[0].reply;
  }
  if (choice === 1 && storm?.rootId === mail.id) storm.until = state.week;
  return null;
}

export function mailSystem(outer) {
  if (!B.mail.enabled) return;
  const ctx = side(outer, 1);
  const { state } = ctx;
  state.mail ??= [];
  for (const m of state.mail) if (openChoice(m) && state.week >= m.expiresWeek) resolve(ctx, m, null);
  for (const m of state.mail.filter((x) => openChoice(x) && !TEMPLATES[x.kind] && EVENTS[x.kind]?.choices)) {
    const subjectId = state.flags.mailCtx?.[m.id]?.subjectId ?? null;
    EVENTS[m.kind].choices.forEach((c, i) => { const why = eventChoiceBlocker(state, c, subjectId); m.options[i].available = !why; m.options[i].reason = why; });
  }
  prune(state);
  if (state.week < B.mail.fromWeek) return;
  if (state.flags.replyAll) growReplyAll(ctx);
  else if (state.week >= (state.flags.replyAllNext ?? 0) && mailSlotFree(state) && chance(ctx.rng, B.mail.replyAllChance)) startReplyAll(ctx);
  if (chance(ctx.rng, B.mail.ambientChance)) ambient(ctx);
  if (mailSlotFree(state) && chance(ctx.rng, B.mail.actionChance)) actionable(ctx);
}

registerSystem('mail', mailSystem, 92);

const findMail = (state, mailId) => (state.mail ?? []).find((m) => m.id === mailId);

registerAction('readMail', (ctx, { mailId }) => {
  const mail = findMail(ctx.state, mailId);
  if (!mail) return { ok: false, reason: 'No such mail' };
  mail.read ??= ctx.state.week;
  return { ok: true };
});

registerAction('answerMail', (outer, { mailId, choice }) => {
  const { state } = outer;
  const mail = findMail(state, mailId);
  if (!mail) return { ok: false, reason: 'No such mail' };
  if (mail.resolved?.choice !== undefined && mail.resolved?.choice !== null) return { ok: false, reason: 'Already answered' };
  if (mail.resolved) return { ok: false, reason: 'That has gone quiet' };
  if (!Number.isInteger(choice) || choice < 0 || choice >= mail.options.length) return { ok: false, reason: 'Invalid choice' };
  if (!mail.options[choice].available) return { ok: false, reason: mail.options[choice].reason ?? 'Invalid choice' };
  resolve(side(outer, 1000 + Number(mail.id.slice(1)) * 7 + choice), mail, choice);
  return { ok: true };
});

registerAction('archiveMail', (outer, { mailId }) => {
  const mail = findMail(outer.state, mailId);
  if (!mail) return { ok: false, reason: 'No such mail' };
  if (openChoice(mail)) resolve(side(outer, 3000 + Number(mail.id.slice(1)) * 7), mail, null);
  mail.archived = true;
  return { ok: true };
});
