import { pacingOn } from './pacing.js';

// The attention queue opened a letter or a Yak prompt (an `askPresented` event). It holds the other asks back
// until it is answered or expires, so it is brought in front of the player: a letter opens as its own card
// (which reads it, starting its expiry), a prompt expands Yak on its channel. A decision opens as
// pendingDecision and needs nothing here.
export function bringAsk(e, state, { openMail, revealPrompt }) {
  if (!pacingOn('askQueue')) return false;
  if (e.kind === 'letter') { openMail({ mailId: e.mailId ?? state.mail?.[0]?.id }); return true; }
  if (e.kind === 'prompt') { revealPrompt(e.promptId ?? e.chatId); return true; }
  return false;
}
