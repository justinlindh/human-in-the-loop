// The inbox as the UI sees it (#17): folders, the unread badge, thread lines, the toast rule and the
// envelope button. All of it is derived from state.mail; the UI never writes mail, it only dispatches
// readMail, answerMail and archiveMail.
import { h, toggleClass, setText } from './dom.js';
import { icon } from './icons.js';
import { B } from '../sim/balance.js';
import { EVENTS } from '../data/events.js';
import { pacingOn } from './pacing.js';

// Category chips: a short name and an accent, so a sender reads at a glance.
export const MAIL_CATEGORY = {
  applicant: { label: 'Applicant', color: '#4f8cff' },
  partner: { label: 'Partner', color: '#34c38f' },
  customer: { label: 'Customer', color: '#ffb020' },
  vendor: { label: 'Vendor', color: '#9b6bff' },
  recruiter: { label: 'Recruiter', color: '#d98c5f' },
  investor: { label: 'Investor', color: '#3fb6b0' },
  invite: { label: 'Invite', color: '#5b6cff' },
  legal: { label: 'Legal', color: '#e5484d' },
  rival: { label: 'Rival', color: '#8a6fd1' },
  staff: { label: 'Staff', color: '#34c38f' },
  spam: { label: 'Spam', color: '#8b8394' },
};
export const categoryOf = (m) => MAIL_CATEGORY[m.category] ?? { label: 'Mail', color: '#8b8394' };

export const FOLDERS = [['inbox', 'Inbox'], ['spam', 'Spam'], ['done', 'Done']];

export const inboxOf = (s) => s?.mail ?? [];

// The envelope shows once the feature is on, or a game already holds mail.
export const mailOn = (s) => !!B.mail?.enabled || inboxOf(s).length > 0;

// Archived or answered mail is done; spam has its own folder; the rest is the inbox.
export function folderOf(m) {
  if (m.archived || m.resolved) return 'done';
  return m.category === 'spam' ? 'spam' : 'inbox';
}

// Mail that is waiting on an answer.
export const hasOpenChoice = (m) => !!m.options?.length && !m.resolved && !m.archived;

// Unread inbox mail: spam never counts. Under mailArchive the envelope is an archive, so only an unread
// letter that waits on an answer counts; everything else is read at leisure with no count.
export const unreadCount = (s) => inboxOf(s).filter((m) => m.read == null && folderOf(m) === 'inbox' && (!pacingOn('mailArchive') || hasOpenChoice(m))).length;

export const ageText = (week, now) => {
  const d = Math.max(0, Math.floor(now - week));
  return d === 0 ? 'this week' : `${d}w ago`;
};

// The start of the body on one line, cut to fit a list row.
export function firstLine(body, max = 90) {
  const t = String(body ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

// The other letters in a mail's thread, oldest first: the reply-all pile reads as a column of short lines.
export function threadOf(s, m) {
  if (!m.threadId) return [];
  return inboxOf(s).filter((x) => x.threadId === m.threadId && x.id !== m.id).sort((a, b) => a.week - b.week || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
}

// Weeks left to answer, or null.
export const weeksLeft = (m, now) => (m.expiresWeek != null && hasOpenChoice(m) ? Math.max(0, m.expiresWeek - Math.floor(now)) : null);

// Mail's `kind` is a mail template id, or the id of an event delivered as mail.
export const isEventMail = (m) => !!EVENTS[m.kind];

// What a tick's new mail asks of the player. Mail that waits on an answer, and important mail, flashes one
// toast that opens it; an event delivered as plain mail raises none, and spam and ambient mail only bump the
// badge. `ping` is true when anything worth a soft sound arrived.
export function mailBeats(events, s) {
  const out = { toasts: [], ping: false };
  for (const e of events ?? []) {
    if (e.type !== 'mail') continue;
    const m = inboxOf(s).find((x) => x.id === e.mailId);
    if (!m || m.category === 'spam') continue;
    // Under mailArchive only a letter that waits on an answer makes a sound (the envelope pulses and the
    // letter has its own card in the panel); no toast, and the rest sits quietly in the archive.
    if (pacingOn('mailArchive')) { if (hasOpenChoice(m)) out.ping = true; continue; }
    out.ping = true;
    const asks = hasOpenChoice(m) || (m.important && !isEventMail(m));
    if (asks) out.toasts.push({ text: `Mail from ${m.from?.name ?? 'someone'}: ${m.subject}`, mailId: m.id });
  }
  return out;
}

// The envelope in the top bar: an unread pip, hidden at zero, and the whole button hidden until mail exists.
export function createMailButton({ open }) {
  const pip = h('span.mailcount', { 'aria-hidden': 'true' });
  const el = h('button.btn.small.mailbtn', { type: 'button', title: 'Mail (I)', 'aria-label': 'Mail', onclick: () => open() }, icon('mail', { size: 18 }), pip);
  el.style.display = 'none';
  let shown = null;
  return {
    el,
    update(s) {
      const on = mailOn(s);
      if (on !== shown) {
        shown = on;
        el.style.display = on ? '' : 'none';
        // The phone top bar makes room for the envelope by dropping the PAUSED word (the pause button shows it too).
        el.parentElement?.classList.toggle('has-mail', on);
      }
      const n = unreadCount(s);
      toggleClass(pip, 'show', n > 0);
      toggleClass(el, 'pulse', n > 0 && pacingOn('mailArchive'));
      setText(pip, n > 9 ? '9+' : String(n || ''));
      el.setAttribute('aria-label', n > 0 ? `Mail, ${n} unread` : 'Mail');
    },
  };
}
