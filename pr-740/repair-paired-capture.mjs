import { ITEMS as original } from './repair-standup-capture.mjs';
const label = process.env.YAK_BUILD_LABEL ?? 'After';
const item = structuredClone(original[0]);
item.id = `async-outage-${label.toLowerCase()}-4x`;
item.title = `${label}: resolved outage and ordinary async update`;
item.setup = item.setup.replace("['capture-reading', ...(window.standupIds ?? [])]", "['capture-reading', ...(window.standupIds ?? []), ...(window.ordinaryIds ?? [])]");
item.setup = item.setup.replace('real async standup outage posts', 'outage + ordinary async standup');
item.setup = item.setup.replace('s.policies.async_standups = false;', `
      const ordinary = makeCtx(s);
      for (const p of s.staff) p.role = 'support';
      for (let attempt = 0; attempt < 10 && !ordinary.events.some(e => e.type === 'chat'); attempt++) standupSystem(ordinary);
      window.ordinaryIds = ordinary.events.filter(e => e.type === 'chat').map(e => e.id);
      window.__captureMarks.push({ t: 0.2, label: 'ordinary producer', posts: ordinary.events.filter(e => e.type === 'chat'), contexts: s.flags.outageChat ?? {} });
      c.events.push(...ordinary.events);
      s.policies.async_standups = false;`);
export const ITEMS = [item];
