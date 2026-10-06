// @vitest-environment happy-dom
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createMailButton, mailBeats, unreadCount } from './mail.js';
import { B } from '../sim/balance.js';

vi.hoisted(() => vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) }))));
afterAll(() => vi.unstubAllGlobals());
afterEach(() => { delete B.pacing; document.body.replaceChildren(); });

const mail = (o = {}) => ({ id: 'm', kind: 'k', week: 10, from: { name: 'A' }, category: 'vendor', subject: 'Hi', body: 'x', read: null, options: [], expiresWeek: null, resolved: null, archived: false, ...o });
const letter = mail({ id: 'L', category: 'investor', subject: 'Offer', options: [{ label: 'Yes' }] });
const flavour = mail({ id: 'F' });
const s = { week: 12, mail: [letter, flavour] };
const ev = (id) => ({ type: 'mail', mailId: id });

describe('mailArchive', () => {
  it('on: only an unread letter counts, the envelope pulses, no toast, a letter makes the sound', () => {
    B.pacing = { mailArchive: true };
    expect(unreadCount(s)).toBe(1);
    const btn = createMailButton({ open: () => {} });
    document.body.append(btn.el);
    btn.update(s);
    expect(btn.el.classList.contains('pulse')).toBe(true);
    expect(btn.el.querySelector('.mailcount').textContent).toBe('1');
    expect(mailBeats([ev('L'), ev('F')], s)).toEqual({ toasts: [], ping: true });
    expect(mailBeats([ev('F')], s)).toEqual({ toasts: [], ping: false });
    btn.update({ week: 12, mail: [{ ...letter, read: 12 }, flavour] });
    expect(btn.el.classList.contains('pulse')).toBe(false);
    expect(btn.el.querySelector('.mailcount').textContent).toBe('');
  });

  it('off: every unread inbox letter counts, nothing pulses, a waiting letter toasts', () => {
    B.pacing = { mailArchive: false };
    expect(unreadCount(s)).toBe(2);
    const btn = createMailButton({ open: () => {} });
    btn.update(s);
    expect(btn.el.classList.contains('pulse')).toBe(false);
    expect(mailBeats([ev('L')], s).toasts).toHaveLength(1);
  });
});
