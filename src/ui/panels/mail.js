import { h, toggleClass } from '../dom.js';
import { icon } from '../icons.js';
import { liveView, tabs } from '../widgets.js';
import { openTarget } from '../openTarget.js';
import { FOLDERS, categoryOf, inboxOf, folderOf, unreadCount, hasOpenChoice, ageText, firstLine, threadOf, weeksLeft } from '../mail.js';

const chip = (m) => { const c = categoryOf(m); return h('span.mailchip', { text: c.label, style: { '--mc': c.color } }); };

// The mail client: folder tabs over a list and a reading pane. Wide screens show both; a phone shows the
// list or the pane, with Back between them. Reading a letter dispatches readMail once; replies go through
// answerMail with the sim's own hints and refusal reasons.
export function mailPanel(ctx, arg) {
  let folder = 'inbox';
  let selected = null;
  const asked = new Set();
  const byId = (s, id) => inboxOf(s).find((m) => m.id === id) ?? null;

  const root = h('div.mail');
  const folderTabs = tabs(FOLDERS.map(([id, label]) => ({ id, label })), folder, (id) => {
    folder = id; folderTabs.set(id);
    // A letter from another folder no longer shows beside this tab's list.
    const open = selected ? byId(ctx.getState(), selected) : null;
    if (open && folderOf(open) !== folder) { selected = null; toggleClass(root, 'reading', false); pane.invalidate(); pane.update(ctx.getState(), true); }
    list.invalidate(); list.update(ctx.getState(), true);
  });

  // Opening a letter reads it, once.
  const markRead = (s) => {
    const m = selected ? byId(s, selected) : null;
    if (m && m.read == null && !asked.has(m.id)) { asked.add(m.id); ctx.act({ type: 'readMail', mailId: m.id }, { quiet: true }); }
  };

  const select = (id) => {
    selected = id;
    toggleClass(root, 'reading', !!id);
    list.invalidate(); pane.invalidate();
    const s = ctx.getState();
    list.update(s, true); pane.update(s, true);
    markRead(s);
  };

  const list = liveView(
    (s) => JSON.stringify([folder, selected, Math.floor(s.week), inboxOf(s).map((m) => [m.id, m.read != null, folderOf(m), !!m.resolved])]),
    (s) => {
      const rows = inboxOf(s).filter((m) => folderOf(m) === folder);
      if (!rows.length) return h('div.empty.mailempty', { text: folder === 'inbox' ? 'Nothing waiting. Letters from outside the company land here.' : folder === 'spam' ? 'No spam has slipped through.' : 'Answered and archived mail lives here.' });
      return h('div.maillist', { role: 'list' }, ...rows.map((m) => {
        const left = weeksLeft(m, s.week);
        return h(`button.mailrow${m.read == null ? '.unread' : ''}${m.id === selected ? '.on' : ''}${m.category === 'spam' ? '.spam' : ''}`, {
          type: 'button', role: 'listitem', dataset: { mail: m.id }, onclick: () => select(m.id),
        },
          chip(m),
          h('span.mailsub', null, m.important ? icon('star', { size: 14 }) : null, h('b', { text: m.subject })),
          h('span.mailfrom.small', { text: `${m.from?.name ?? ''}${m.from?.org ? `, ${m.from.org}` : ''}` }),
          h('span.mailfirst.small.muted', { text: firstLine(m.body) }),
          h('span.mailmeta.small', null,
            h('span.muted', { text: ageText(m.week, s.week) }),
            hasOpenChoice(m) ? h('span.pill.warn', { text: left != null ? `answer in ${left}w` : 'needs an answer' }) : null));
      }));
    });

  const pane = liveView(
    (s) => { const m = byId(s, selected); return JSON.stringify([selected, m && [m.read != null, m.archived, m.resolved, m.options?.map((o) => o.available), threadOf(s, m).length, weeksLeft(m, s.week)]]); },
    (s) => {
      const m = byId(s, selected);
      if (!m) return h('div.empty.mailempty', { text: 'Pick a letter to read it.' });
      const left = weeksLeft(m, s.week);
      const thread = threadOf(s, m);
      const answer = (i) => {
        const opens = m.options?.[i]?.opens;
        if (!ctx.act({ type: 'answerMail', mailId: m.id, choice: i }).ok) return;
        ctx.sfx('confirm');
        if (opens) openTarget(ctx, opens);
      };
      const done = m.resolved ? h('div.mailreply', null, icon('check', { size: 16 }),
        h('span', { text: m.resolved.choice == null || m.resolved.replyText == null ? 'No reply.' : `You replied: ${m.resolved.replyText}` })) : null;
      return [
        h('button.btn.small.mailback', { type: 'button', onclick: () => select(null) }, icon('arrow.back', { size: 14 }), ' Back'),
        h('div.mailhead', null,
          chip(m),
          h('h3', { text: m.subject }),
          h('div.small.muted', { text: `From ${m.from?.name ?? 'someone'}${m.from?.org ? `, ${m.from.org}` : ''}${m.to ? ` to ${m.to}` : ''} · ${ageText(m.week, s.week)}` }),
          m.category === 'spam' ? h('div.small.mailspamtag', { text: 'Slipped through the filter.' }) : null),
        h('div.mailbody', null, ...String(m.body ?? '').split(/\n\s*\n/).map((p) => h('p', { text: p }))),
        thread.length ? h('div.mailthread', null, h('b.small', { text: 'Earlier in this thread' }),
          ...thread.map((t) => h('div.mailthreadline', null, h('b', { text: `${t.from?.name ?? ''}:` }), ' ', firstLine(t.body, 160)))) : null,
        done,
        hasOpenChoice(m) ? h('div.mailopts', null,
          left != null ? h('div.small.warn-t', { text: left === 0 ? 'Answer this week or it goes quiet.' : `Answer within ${left} ${left === 1 ? 'week' : 'weeks'} or it goes quiet.` }) : null,
          ...m.options.map((o, i) => h('button.btn.mailopt', { type: 'button', disabled: o.available === false, onclick: () => answer(i) },
            h('b', { text: o.label }), o.hint ? h('span.small', { text: o.hint }) : null,
            o.available === false && o.reason ? h('span.small.bad-t', { text: o.reason }) : null))) : null,
        m.archived ? null : h('div.mailfoot', null, h('button.btn.small', { type: 'button', onclick: () => {
          if (!ctx.act({ type: 'archiveMail', mailId: m.id }).ok) return;
          ctx.sfx('click');
          if (matchMedia?.('(max-width: 600px)').matches) select(null);
        } }, icon('save.export', { size: 14 }), hasOpenChoice(m) ? ' Archive (ignore)' : ' Archive')),
      ];
    });

  root.append(list.el, pane.el);
  if (arg?.mailId) { selected = arg.mailId; root.classList.add('reading'); const m = byId(ctx.getState(), arg.mailId); if (m) folder = folderOf(m); folderTabs.set(folder); }

  return {
    el: root,
    tabs: folderTabs.el,
    update(s, force) {
      for (const [id] of FOLDERS) folderTabs.setLabel(id, id === 'inbox' ? (unreadCount(s) ? `Inbox (${unreadCount(s)})` : 'Inbox') : FOLDERS.find((f) => f[0] === id)[1]);
      list.update(s, force);
      pane.update(s, force);
      markRead(s);
    },
  };
}
