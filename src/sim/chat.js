import { newId } from './util.js';

// Emits a Slackk chat event in the contract shape. `person` may be a staff object or null for bots.
export function emitChat(ctx, { channel = 'general', person = null, from = person?.name, text, replyTo = null, reactions = {} }) {
  const msg = { type: 'chat', id: newId(ctx.state, 'm'), channel, from, fromId: person?.id ?? null, text, replyTo, reactions };
  ctx.emit(msg);
  return msg;
}
