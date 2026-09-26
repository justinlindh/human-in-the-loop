import { ITEMS as original } from './capture.mjs';
const item = structuredClone(original[0]);
item.id = 'independent-standup-outage-4x';
item.title = 'Async standup outage message after recovery at 4x';
item.seconds = 8;
item.screenshots = [1.5, 6.5, 7.5];
item.setup = item.setup
  .replace('s.week = 20;', 's.week = 1;')
  .replace("const { startOutage, clearOutage }", "const { standupSystem } = await import('/src/sim/standup.js');\n    const { startOutage, clearOutage }")
  .replace('Please read this company update while the team works. We have a full queue of messages today. This notice keeps its normal reading time at every game speed, so everyone has enough time to finish reading before the next post.', 'Read this company update.')
  .replace("['capture-reading', 'capture-outage', 'capture-routine']", "['capture-reading', ...(window.standupIds ?? [])]")
  .replace('Queued at 0.2s: outage post + routine post', 'Queued at 0.2s: real async standup outage posts')
  .replace("emitChat(c, { id: 'capture-outage', person: s.staff[0], text: 'Inboxer is down. Investigating the outage now.', outage: true });\n      emitChat(c, { id: 'capture-routine', person: s.staff[1], text: 'The week 20 standup starts now. See you there.' });", `
      s.policies.async_standups = true; s.policies.daily_standups = false;
      for (const p of s.staff) { p.role = 'engineer'; p.assignment = { type: 'idle' }; p.mood = 'happy'; }
      for (let attempt = 0; attempt < 10 && !c.events.some(e => e.type === 'chat'); attempt++) standupSystem(c);
      window.standupIds = c.events.filter(e => e.type === 'chat').map(e => e.id);
      window.__captureMarks.push({ t: 0.2, label: 'standup producer', posts: c.events.filter(e => e.type === 'chat'), contexts: s.flags.outageChat ?? {} });
      s.policies.async_standups = false;
      document.querySelector('.chat-tab[data-channel="standup"]')?.click();
    `);
item.actions.push({ at: 1.1, js: `Array.from(document.querySelectorAll('.chat button')).find(b => b.textContent.trim() === '#standup')?.click()` });
export const ITEMS = [item];
