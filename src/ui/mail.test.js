import { describe, expect, it } from 'vitest';
import { folderOf, unreadCount, hasOpenChoice, ageText, firstLine, threadOf, weeksLeft, mailBeats, mailOn } from './mail.js';

const mail = (o = {}) => ({ id: 'm1', kind: 'k', week: 10, from: { name: 'A', org: 'B' }, category: 'vendor', subject: 'Hi', body: 'One.\n\nTwo.', read: null, options: [], expiresWeek: null, resolved: null, archived: false, ...o });
const state = (...m) => ({ week: 12, mail: m });

describe('folders and the badge', () => {
  it('files mail by state', () => {
    expect(folderOf(mail())).toBe('inbox');
    expect(folderOf(mail({ category: 'spam' }))).toBe('spam');
    expect(folderOf(mail({ resolved: { choice: 0, week: 11, replyText: 'ok' } }))).toBe('done');
    expect(folderOf(mail({ archived: true, category: 'spam' }))).toBe('done');
  });

  it('counts unread inbox mail only', () => {
    const s = state(mail({ id: 'a' }), mail({ id: 'b', read: 11 }), mail({ id: 'c', category: 'spam' }), mail({ id: 'd', archived: true }));
    expect(unreadCount(s)).toBe(1);
    expect(unreadCount({ week: 1 })).toBe(0);
  });

  it('shows the envelope once a game holds mail', () => {
    expect(mailOn({ mail: [] })).toBe(false);
    expect(mailOn(state(mail()))).toBe(true);
  });
});

describe('text helpers', () => {
  it('words ages and weeks left', () => {
    expect(ageText(12, 12)).toBe('this week');
    expect(ageText(9, 12)).toBe('3w ago');
    const open = mail({ options: [{ label: 'x' }], expiresWeek: 15 });
    expect(hasOpenChoice(open)).toBe(true);
    expect(weeksLeft(open, 12)).toBe(3);
    expect(weeksLeft(mail(), 12)).toBe(null);
    expect(weeksLeft({ ...open, resolved: { choice: 0 } }, 12)).toBe(null);
  });

  it('puts the start of the body on one line for a row', () => {
    expect(firstLine('One.\n\nTwo.')).toBe('One. Two.');
    expect(firstLine('x'.repeat(200), 20)).toHaveLength(20);
  });
});

describe('threads', () => {
  it('lists the other letters of a thread, oldest first', () => {
    const a = mail({ id: 'm3', threadId: 't', week: 11 });
    const b = mail({ id: 'm1', threadId: 't', week: 9 });
    const c = mail({ id: 'm2', threadId: 'other' });
    expect(threadOf(state(a, b, c), a).map((m) => m.id)).toEqual(['m1']);
    expect(threadOf(state(a), mail())).toEqual([]);
  });
});

describe('mailBeats', () => {
  const ev = (id) => ({ type: 'mail', mailId: id });
  it('toasts mail that waits on an answer and important mail, and pings for anything but spam', () => {
    const ask = mail({ id: 'a', options: [{ label: 'Yes' }], expiresWeek: 20, subject: 'Offer' });
    const imp = mail({ id: 'b', important: true, subject: 'Notice' });
    const plain = mail({ id: 'c' });
    const spam = mail({ id: 'd', category: 'spam' });
    const out = mailBeats([ev('a'), ev('b'), ev('c'), ev('d')], state(ask, imp, plain, spam));
    expect(out.toasts.map((t) => t.mailId)).toEqual(['a', 'b']);
    expect(out.toasts[0].text).toBe('Mail from A: Offer');
    expect(out.ping).toBe(true);
  });

  it('raises no toast for an event delivered as plain mail, and no ping for spam alone', () => {
    const moved = mail({ id: 'a', eventId: 'vendor_price_hike', important: true });
    expect(mailBeats([ev('a')], state(moved)).toasts).toEqual([]);
    const spam = mail({ id: 'd', category: 'spam' });
    expect(mailBeats([ev('d')], state(spam))).toEqual({ toasts: [], ping: false });
  });
});
