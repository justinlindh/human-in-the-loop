import { pick } from './rng.js';
import { EVENTS } from '../data/events.js';
import { incumbentFor } from '../data/incumbents.js';

// Resolves the text placeholders for an event against a subject (staff or product id).
export function fillText(state, rng, text, subjectId) {
  const person = state.staff.find((p) => p.id === subjectId);
  const product = state.products.find((p) => p.id === subjectId);
  const category = product?.category ?? pick(rng, state.market.unlockedCategories);
  return text
    .replaceAll('{name}', person?.name ?? 'Someone')
    .replaceAll('{product}', product?.name ?? 'your product')
    .replaceAll('{company}', state.companyName)
    .replaceAll('{incumbent}', incumbentFor(category).name);
}

// Opens a decision popup for a choice event. Returns false if one is already pending.
export function raiseDecision(ctx, eventId, subjectId = null) {
  const { state } = ctx;
  const ev = EVENTS[eventId];
  if (!ev || !ev.choices || state.pendingDecision) return false;
  state.pendingDecision = {
    eventId, subjectId,
    title: fillText(state, ctx.rng, ev.title, subjectId),
    text: fillText(state, ctx.rng, ev.text, subjectId),
    choices: ev.choices.map((c) => ({ label: c.label, hint: c.hint })),
  };
  ctx.emit({ type: 'decision' });
  return true;
}
