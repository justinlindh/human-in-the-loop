import { h } from './dom.js';
import { icon } from './icons.js';
import { openTarget } from './openTarget.js';
import { pacingOn } from './pacing.js';
import { categoryOf, hasOpenChoice, ageText, firstLine, threadOf, weeksLeft } from './mail.js';

const chip = (m) => { const c = categoryOf(m); return h('span.mailchip', { text: c.label, style: { '--mc': c.color } }); };

// One letter as nodes: head, body, thread, the reply line, the choices and the archive button. The Mail panel's
// reading pane and the letter card the attention queue opens share it. `onDone(kind)` runs after an answer
// ('answered') or an archive ('archived') succeeded, `choiceKeys` numbers the choices for the card.
export function letterView(ctx, s, m, { onDone = () => {}, choiceKeys = false } = {}) {
  const left = weeksLeft(m, s.week);
  const thread = threadOf(s, m);
  const answer = (i) => {
    const opens = m.options?.[i]?.opens;
    if (!ctx.act({ type: 'answerMail', mailId: m.id, choice: i }).ok) return;
    ctx.sfx('confirm');
    if (opens) openTarget(ctx, opens);
    onDone('answered');
  };
  const done = m.resolved ? h('div.mailreply', null, icon('check', { size: 16 }),
    h('span', { text: m.resolved.choice == null || m.resolved.replyText == null ? 'No reply.' : `You replied: ${m.resolved.replyText}` })) : null;
  return {
    answer,
    nodes: [
      h(`div.mailhead${hasOpenChoice(m) && pacingOn('mailArchive') ? '.letter' : ''}`, null,
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
          choiceKeys ? h('span.ckey.num', { text: String(i + 1) }) : null,
          h('b', { text: o.label }), o.hint ? h('span.small', { text: o.hint }) : null,
          o.available === false && o.reason ? h('span.small.bad-t', { text: o.reason }) : null))) : null,
      m.archived ? null : h('div.mailfoot', null, h('button.btn.small', { type: 'button', onclick: () => {
        if (!ctx.act({ type: 'archiveMail', mailId: m.id }).ok) return;
        ctx.sfx('click');
        onDone('archived');
      } }, icon('save.export', { size: 14 }), hasOpenChoice(m) ? ' Archive (ignore)' : ' Archive')),
    ],
  };
}
