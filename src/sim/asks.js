import { B } from './balance.js';
import { registerAction } from './registry.js';
import { emitChat } from './chat.js';
import { pick } from './rng.js';
import { EVENTS } from '../data/events.js';
import { EVENT_MAIL } from '../data/mail.js';
import { ASK_EXPIRED_LINES } from '../data/asks.js';
import { ASK_DEFAULTS } from '../data/ask-defaults.js';
import { raiseDecision, decisionVars, fillText, choiceBlocker } from './events.js';
import { openEventPrompt } from './prompts.js';
import { openEventMail, sendTemplate, expireTemplate } from './mail.js';
import { applyEffects } from './effects.js';

// The ask queue (#1639): with B.pacing.askQueue on, decisions, Yak prompts and letters wait here as candidates
// instead of opening, and the attention clock (or a bot) presents them one at a time. Off, nothing reaches it.

export const askQueueOn = () => !!B.pacing.askQueue;

// What interrupts at once and never expires: incident and cyber events unless their data says
// `emergency: false`, and any event or mail template whose data says `emergency: true`.
const EMERGENCY_KINDS = new Set(['incident', 'cyber']);
const isEmergency = (ev) => (EMERGENCY_KINDS.has(ev.kind) && ev.emergency !== false) || !!ev.emergency || !!EVENT_MAIL[ev.id]?.emergency;
const decisionPriority = (ev) => (isEmergency(ev) ? 'emergency' : 'normal');
const RANK = { emergency: 0, normal: 1, low: 2 };

// An identity choice the player must make (`noExpire: true` in its data): it waits its turn but never
// expires, goes stale or counts toward the cap.
export const needsAnswer = (ask) => !!EVENTS[ask.ref?.eventId]?.noExpire;
// Asks the cap counts and expiry may take: neither emergencies nor ones that need an answer.
export const expirable = (ask) => ask.priority !== 'emergency' && !needsAnswer(ask);

// The choice an unanswered decision falls back to: its own defaultChoice, the one picked for it in
// ASK_DEFAULTS, or the choice that does nothing. Null when it has none of these.
export function defaultChoiceOf(ev) {
  if (Number.isInteger(ev.defaultChoice)) return ev.defaultChoice;
  if (Number.isInteger(ASK_DEFAULTS[ev.id])) return ASK_DEFAULTS[ev.id];
  const idle = ev.choices.findIndex((c) => !c.effects || Object.keys(c.effects).length === 0);
  return idle >= 0 ? idle : null;
}

function enqueue(ctx, { kind, priority, ref, defaultChoice }) {
  const { state } = ctx;
  state.asks ??= [];
  state.flags.askSeq = (state.flags.askSeq ?? 0) + 1;
  const ask = {
    id: `ask${state.flags.askSeq}`, kind, priority, week: state.week, expiresWeek: null, defaultChoice, ref,
  };
  if (expirable(ask)) ask.expiresWeek = state.week + B.attention.staleWeeks;
  state.asks.push(ask);
  ctx.emit({ type: 'askQueued', askId: ask.id, kind, priority });
  // With expiry on, a full queue lets its least pressing, oldest ask go to its default at once.
  const waiting = state.asks.filter(expirable);
  if (B.pacing.askExpiry && waiting.length > B.attention.queueCap) {
    const out = waiting.sort((a, b) => RANK[b.priority] - RANK[a.priority] || a.week - b.week || seqOf(a) - seqOf(b))[0];
    expire(ctx, out);
  }
  return ask;
}

const seqOf = (a) => Number(a.id.slice(3));

// vars: a card that brings its own (an interview tape) keeps them for when it opens.
export function queueDecision(ctx, eventId, subjectId, vars = null) {
  const ev = EVENTS[eventId];
  return enqueue(ctx, { kind: 'decision', priority: decisionPriority(ev),
    ref: { eventId, subjectId, ...(vars ? { vars } : {}) }, defaultChoice: defaultChoiceOf(ev) });
}

export function queuePrompt(ctx, ev, subjectId) {
  return enqueue(ctx, { kind: 'prompt', priority: 'low', ref: { eventId: ev.id, subjectId }, defaultChoice: ev.yak?.ignore ?? null });
}

export function queueEventLetter(ctx, ev, subjectId) {
  return enqueue(ctx, { kind: 'letter', priority: isEmergency(ev) ? 'emergency' : 'low', ref: { eventId: ev.id, subjectId }, defaultChoice: EVENT_MAIL[ev.id]?.ignore ?? null });
}

export function queueTemplateLetter(ctx, templateId, mc, emergency = false) {
  return enqueue(ctx, { kind: 'letter', priority: emergency ? 'emergency' : 'low', ref: { template: templateId, mc }, defaultChoice: null });
}

// A candidate past its expiresWeek no longer fits: it goes without a default or a word.
export function dropStale(state) {
  if (state.asks?.some((a) => a.expiresWeek !== null && state.week >= a.expiresWeek)) {
    state.asks = state.asks.filter((a) => a.expiresWeek === null || state.week < a.expiresWeek);
  }
}

// Emergencies first, then normal, then low; oldest first within each.
export function headAsk(state) {
  const asks = state.asks ?? [];
  return asks.length ? [...asks].sort((a, b) => RANK[a.priority] - RANK[b.priority] || a.week - b.week || seqOf(a) - seqOf(b))[0] : null;
}

const removeAsk = (state, id) => { state.asks = state.asks.filter((a) => a.id !== id); };

function open(ctx, ask) {
  const { state } = ctx;
  const { ref } = ask;
  if (ref.template) return sendTemplate(ctx, ref.template, ref.mc);
  const ev = EVENTS[ref.eventId];
  if (!ev) return false;
  if (ask.kind === 'decision') return raiseDecision(ctx, ev.id, ref.subjectId, { fromQueue: true, asked: true, vars: ref.vars ?? null });
  if (ask.kind === 'prompt') { state.chatPrompts ??= []; openEventPrompt(ctx, ev, ref.subjectId); return true; }
  openEventMail(ctx, ev, ref.subjectId);
  return true;
}

registerAction('presentAsk', (ctx, { askId } = {}) => {
  const { state } = ctx;
  dropStale(state);
  if (!(state.asks ?? []).length) return { ok: false, reason: 'No asks waiting' };
  const ask = askId ? state.asks.find((a) => a.id === askId) : headAsk(state);
  if (!ask) return { ok: false, reason: 'No such ask' };
  if (ask.kind === 'decision' && state.pendingDecision) return { ok: false, reason: 'Finish the open decision first' };
  removeAsk(state, ask.id);
  state.flags.lastAskWeek = state.week;
  // A candidate whose moment has passed (its subject left, its era ended) opens nothing.
  return { ok: true, opened: !!open(ctx, ask) };
});

// What an unanswered ask does: its default choice, or a letter's ignore outcome. Returns the title and
// the label of what the team picked, for the Yak line.
function settle(ctx, ask) {
  const { state } = ctx;
  const { ref } = ask;
  if (ref.template) { expireTemplate(ctx, ref.template, ref.mc); return { title: 'An email', picked: 'left it unanswered' }; }
  const ev = EVENTS[ref.eventId];
  if (!ev) return { title: 'Something', picked: 'let it go' };
  const title = fillText(state, ctx.rng, ev.title, ref.subjectId);
  const c = Number.isInteger(ask.defaultChoice) ? ev.choices[ask.defaultChoice] : null;
  if (!c || choiceBlocker(state, c, ref.subjectId)) return { title, picked: 'let it go' };
  const vars = ref.vars ?? decisionVars(state, ctx.rng, ref.subjectId);
  applyEffects(ctx, c.effects, ref.subjectId, ev.id, vars);
  return { title, picked: `"${fillText(state, ctx.rng, c.label, ref.subjectId, vars)}"` };
}

function expire(ctx, ask) {
  const { state } = ctx;
  removeAsk(state, ask.id);
  const { title, picked } = settle(ctx, ask);
  emitChat(ctx, { channel: 'general', from: '@officebot', text: pick(ctx.rng, ASK_EXPIRED_LINES).replaceAll('{title}', title).replaceAll('{picked}', picked) });
  ctx.emit({ type: 'askExpired', askId: ask.id, kind: ask.kind });
}

registerAction('expireAsk', (ctx, { askId } = {}) => {
  const { state } = ctx;
  if (!B.pacing.askExpiry) return { ok: false, reason: 'Expiry is off' };
  const ask = (state.asks ?? []).find((a) => a.id === askId);
  if (!ask) return { ok: false, reason: 'No such ask' };
  if (ask.priority === 'emergency') return { ok: false, reason: 'Emergencies never expire' };
  if (needsAnswer(ask)) return { ok: false, reason: 'This one needs an answer' };
  expire(ctx, ask);
  return { ok: true };
});
