import { B } from './balance.js';
import { registerAction } from './registry.js';
import { emitChat } from './chat.js';
import { pick } from './rng.js';
import { EVENTS } from '../data/events.js';
import { EVENT_MAIL } from '../data/mail.js';
import { ASK_EXPIRED_LINES } from '../data/asks.js';
import { raiseDecision, decisionVars, fillText } from './events.js';
import { openEventPrompt } from './prompts.js';
import { openEventMail, sendTemplate, expireTemplate, eventChoiceBlocker } from './mail.js';
import { applyEffects } from './effects.js';

// The ask queue (#1639): with B.pacing.askQueue on, decisions, Yak prompts and letters wait here as candidates
// instead of opening, and the attention clock (or a bot) presents them one at a time. Off, nothing reaches it.

export const askQueueOn = () => !!B.pacing.askQueue;

// The decision kinds that interrupt at once.
const EMERGENCY_KINDS = new Set(['incident', 'cyber']);

// The choice an unanswered decision falls back to: its own defaultChoice, else the one that does nothing,
// else the last.
export function defaultChoiceOf(ev) {
  if (Number.isInteger(ev.defaultChoice)) return ev.defaultChoice;
  const idle = ev.choices.findIndex((c) => !c.effects || Object.keys(c.effects).length === 0);
  return idle >= 0 ? idle : ev.choices.length - 1;
}

function enqueue(ctx, { kind, priority, ref, defaultChoice }) {
  const { state } = ctx;
  state.asks ??= [];
  state.flags.askSeq = (state.flags.askSeq ?? 0) + 1;
  const ask = {
    id: `ask${state.flags.askSeq}`, kind, priority, week: state.week,
    expiresWeek: priority === 'emergency' ? null : state.week + B.attention.staleWeeks,
    defaultChoice, ref,
  };
  state.asks.push(ask);
  ctx.emit({ type: 'askQueued', askId: ask.id, kind, priority });
  return ask;
}

// vars: a card that brings its own (an interview tape) keeps them for when it opens.
export function queueDecision(ctx, eventId, subjectId, vars = null) {
  const ev = EVENTS[eventId];
  return enqueue(ctx, { kind: 'decision', priority: EMERGENCY_KINDS.has(ev.kind) ? 'emergency' : 'normal',
    ref: { eventId, subjectId, ...(vars ? { vars } : {}) }, defaultChoice: defaultChoiceOf(ev) });
}

export function queuePrompt(ctx, ev, subjectId) {
  return enqueue(ctx, { kind: 'prompt', priority: 'low', ref: { eventId: ev.id, subjectId }, defaultChoice: ev.yak?.ignore ?? null });
}

export function queueEventLetter(ctx, ev, subjectId) {
  return enqueue(ctx, { kind: 'letter', priority: 'low', ref: { eventId: ev.id, subjectId }, defaultChoice: EVENT_MAIL[ev.id]?.ignore ?? null });
}

export function queueTemplateLetter(ctx, templateId, mc) {
  return enqueue(ctx, { kind: 'letter', priority: 'low', ref: { template: templateId, mc }, defaultChoice: null });
}

// A candidate past its expiresWeek no longer fits: it goes without a default or a word.
export function dropStale(state) {
  if (state.asks?.some((a) => a.expiresWeek !== null && state.week >= a.expiresWeek)) {
    state.asks = state.asks.filter((a) => a.expiresWeek === null || state.week < a.expiresWeek);
  }
}

// Emergencies first, then the oldest.
export function headAsk(state) {
  const asks = state.asks ?? [];
  return asks.find((a) => a.priority === 'emergency') ?? asks[0] ?? null;
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

// What an unanswered ask does: the decision's default choice, the prompt's or letter's ignore outcome.
function settle(ctx, ask) {
  const { state } = ctx;
  const { ref } = ask;
  if (ref.template) { expireTemplate(ctx, ref.template, ref.mc); return null; }
  const ev = EVENTS[ref.eventId];
  if (!ev || ask.defaultChoice === null || ask.defaultChoice === undefined) return ev ?? null;
  const c = ev.choices[ask.defaultChoice];
  if (c && !eventChoiceBlocker(state, c, ref.subjectId)) applyEffects(ctx, c.effects, ref.subjectId, ev.id, decisionVars(state, ctx.rng, ref.subjectId));
  return ev;
}

registerAction('expireAsk', (ctx, { askId } = {}) => {
  const { state } = ctx;
  const ask = (state.asks ?? []).find((a) => a.id === askId);
  if (!ask) return { ok: false, reason: 'No such ask' };
  if (ask.priority === 'emergency') return { ok: false, reason: 'Emergencies never expire' };
  removeAsk(state, ask.id);
  const ev = settle(ctx, ask);
  const title = ev ? fillText(state, ctx.rng, ev.title, ask.ref.subjectId) : 'An email';
  emitChat(ctx, { channel: 'general', from: '@officebot', text: pick(ctx.rng, ASK_EXPIRED_LINES).replaceAll('{title}', title) });
  ctx.emit({ type: 'askExpired', askId: ask.id, kind: ask.kind });
  return { ok: true };
});
