import { importantChat } from '../yak-pacing.js';
import { pacingOn } from './pacing.js';

// Whether a new message raises an unread count at a Yak level. A reply the pacer rushed out
// (priority) counts at Important, since it answers something the player is waiting on. Under
// quietYak flavour never counts, whatever the level, so only #incidents, #wins and important
// posts light the dock.
export function countsAsNew(m, channel, level) {
  if (level === 'off') return false;
  if (level === 'all' && !pacingOn('quietYak')) return true;
  return m.priority === true || importantChat({ ...m, channel });
}
