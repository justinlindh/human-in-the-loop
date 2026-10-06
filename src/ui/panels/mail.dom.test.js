// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { B } from '../../sim/balance.js';

vi.mock('../openTarget.js', () => ({ openTarget: vi.fn() }));
const { mailPanel } = await import('./mail.js');
const { openTarget } = await import('../openTarget.js');

const mail = (o = {}) => ({ id: 'm1', kind: 'k', week: 10, from: { name: 'Pat', org: 'Acme' }, category: 'vendor', subject: 'Quick 15 minutes?', body: 'Hello there.\n\nSecond paragraph.', read: null, options: [], expiresWeek: null, resolved: null, archived: false, ...o });

function setup(mails, arg) {
  const s = { week: 12, mail: mails };
  const acts = [];
  const ctx = {
    getState: () => s,
    act: vi.fn((a, o) => { acts.push(a); return ctx.result(a, o); }),
    result: () => ({ ok: true }),
    sfx: vi.fn(),
    acts,
  };
  const inst = mailPanel(ctx, arg);
  document.body.append(inst.tabs, inst.el);
  inst.update(s, true);
  return { s, ctx, inst };
}
const real = B.pacing;
beforeEach(() => { B.pacing = {}; });
afterEach(() => { B.pacing = real; document.body.replaceChildren(); });

describe('mail panel', () => {
  it('lists the inbox with unread rows, and spam only in its tab', () => {
    const { inst } = setup([mail({ id: 'a' }), mail({ id: 'b', read: 9 }), mail({ id: 'c', category: 'spam', subject: 'Prince' })]);
    expect([...inst.el.querySelectorAll('.mailrow')].map((r) => r.dataset.mail)).toEqual(['a', 'b']);
    expect(inst.el.querySelector('.mailrow.unread').dataset.mail).toBe('a');
    expect(inst.tabs.textContent).toContain('Inbox (1)');
    [...inst.tabs.querySelectorAll('button')].find((b) => b.textContent.includes('Spam')).click();
    expect([...inst.el.querySelectorAll('.mailrow')].map((r) => r.dataset.mail)).toEqual(['c']);
  });

  it('opens a letter, reads it once, and shows the body', () => {
    const { inst, ctx, s } = setup([mail({ id: 'a' })]);
    inst.el.querySelector('.mailrow').click();
    expect(inst.el.classList.contains('reading')).toBe(true);
    expect(inst.el.querySelector('.mailbody').textContent).toContain('Second paragraph.');
    expect(ctx.acts.filter((a) => a.type === 'readMail')).toEqual([{ type: 'readMail', mailId: 'a' }]);
    inst.update(s, false);
    expect(ctx.acts.filter((a) => a.type === 'readMail')).toHaveLength(1);
  });

  it('answers through answerMail and acts on the option\'s opens', () => {
    const opts = [{ label: 'Take the meeting', hint: 'A little knowledge.', available: true, opens: { panel: 'staff' } }, { label: 'Unsubscribe', hint: '', available: true }];
    const { inst, ctx } = setup([mail({ id: 'a', read: 11, options: opts, expiresWeek: 15 })], { mailId: 'a' });
    expect(inst.el.textContent).toContain('Answer within 3 weeks');
    inst.el.querySelectorAll('.mailopt')[0].click();
    expect(ctx.acts).toContainEqual({ type: 'answerMail', mailId: 'a', choice: 0 });
    expect(openTarget).toHaveBeenCalledWith(ctx, { panel: 'staff' });
  });

  it('keeps an option disabled with its reason, and does not sound a refused answer', () => {
    const opts = [{ label: 'Refund', hint: 'Costs cash.', available: false, reason: 'Not enough cash' }];
    const { inst } = setup([mail({ id: 'a', read: 11, options: opts })], { mailId: 'a' });
    const b = inst.el.querySelector('.mailopt');
    expect(b.disabled).toBe(true);
    expect(b.textContent).toContain('Not enough cash');
  });

  it('shows no sound and no opens when the sim refuses an answer', () => {
    const opts = [{ label: 'Yes', available: true, opens: { panel: 'office' } }];
    const { inst, ctx } = setup([mail({ id: 'a', read: 11, options: opts })], { mailId: 'a' });
    openTarget.mockClear();
    ctx.result = () => ({ ok: false, reason: 'That has gone quiet' });
    inst.el.querySelector('.mailopt').click();
    expect(ctx.sfx).not.toHaveBeenCalled();
    expect(openTarget).not.toHaveBeenCalled();
  });

  it('shows what was replied, the thread, and archives on request', () => {
    const t1 = mail({ id: 'b', threadId: 't', week: 9, from: { name: 'Sam', org: null }, body: 'Please remove me from this list.' });
    const t2 = mail({ id: 'a', threadId: 't', read: 11, resolved: { choice: 0, week: 12, replyText: 'Please stop replying all.' } });
    const { inst, ctx } = setup([t2, t1], { mailId: 'a' });
    expect(inst.el.querySelector('.mailreply').textContent).toContain('You replied: Please stop replying all.');
    expect(inst.el.querySelector('.mailthread').textContent).toContain('Please remove me from this list.');
    const plain = setup([mail({ id: 'z', read: 11 })], { mailId: 'z' });
    plain.inst.el.querySelector('.mailfoot .btn').click();
    expect(plain.ctx.acts).toContainEqual({ type: 'archiveMail', mailId: 'z' });
    expect(ctx.acts.some((a) => a.type === 'archiveMail')).toBe(false);
  });

  it('says so when a letter went unanswered', () => {
    const { inst } = setup([mail({ id: 'a', read: 11, resolved: { choice: null, week: 12 } })], { mailId: 'a' });
    expect(inst.el.querySelector('.mailreply').textContent).toContain('No reply.');
  });

  it('drops the open letter when the tab changes to a folder that does not hold it', () => {
    const { inst } = setup([mail({ id: 'a', read: 11 }), mail({ id: 'c', category: 'spam', read: 11 })], { mailId: 'a' });
    expect(inst.el.querySelector('.mailbody')).toBeTruthy();
    [...inst.tabs.querySelectorAll('button')].find((b) => b.textContent.includes('Spam')).click();
    expect(inst.el.querySelector('.mailbody')).toBeNull();
    expect(inst.el.classList.contains('reading')).toBe(false);
  });
});
