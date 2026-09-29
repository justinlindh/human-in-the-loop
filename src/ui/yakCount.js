import { importantChat } from '../yak-pacing.js';

// Whether a new message raises an unread count at a Yak level. A reply the pacer rushed out
// (priority) counts at Important, since it answers something the player is waiting on.
export function countsAsNew(m, channel, level) {
  if (level === 'all') return true;
  if (level !== 'important') return false;
  return m.priority === true || importantChat({ ...m, channel });
}
