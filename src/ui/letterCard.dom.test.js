// @vitest-environment happy-dom
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPopups } from './popups.js';
import { pReset } from './pclock.js';

vi.hoisted(() => vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) }))));
afterAll(() => vi.unstubAllGlobals());

const letter = () => ({ id: 'L1', kind: 'investor_offer', week: 3, from: { name: 'Priya Rao', org: 'Northgate' }, category: 'investor', subject: 'A term sheet', body: 'We like it.\n\nSay the word.', read: null,
  options: [{ label: 'Take the meeting', hint: 'Cash now' }, { label: 'Decline', hint: 'Nothing happens' }], expiresWeek: 11, resolved: null, archived: false });
const state = (extra = {}) => ({ week: 4, gameOver: false, pendingDecision: null, products: [], projects: [], campaigns: [], staff: [], mail: [letter()], ...extra });

let speed;
let acts;
const setup = () => {
  const layer = document.createElement('div');
  document.body.append(layer);
  const ctx = {
    controls: { getSpeed: () => speed, setSpeed: (n) => { speed = n; } },
    sfx: vi.fn(),
    act: vi.fn((a) => { acts.push(a.type); return { ok: true }; }),
    getState: state,
  };
  const p = createPopups({ layer, ctx, toasts: { setDock: vi.fn() }, restoreDock: vi.fn() });
  return { layer, p, ctx };
};

beforeEach(() => { pReset(); speed = 2; acts = []; });
afterEach(() => { document.body.replaceChildren(); });

describe('a presented letter card', () => {
  it('shows the letter and its numbered choices, pauses, and reads it once', () => {
    const { layer, p } = setup();
    p.openLetter(state(), 'L1');
    expect(layer.querySelector('.modal.letterdecision h3').textContent).toBe('A term sheet');
    expect(layer.querySelectorAll('.mailopt')).toHaveLength(2);
    expect(layer.querySelector('.mailopt .ckey').textContent).toBe('1');
    expect(layer.textContent).toContain('Archive (ignore)');
    expect(speed).toBe(0);
    expect(p.open).toBe(true);
    expect(p.letterOpen).toBe(true);
    expect(acts.filter((a) => a === 'readMail')).toHaveLength(1);
    p.update(state());
    expect(acts.filter((a) => a === 'readMail')).toHaveLength(1);
  });

  it('answering by click or key closes the card and resumes the old speed', () => {
    const { layer, p } = setup();
    p.openLetter(state(), 'L1');
    layer.querySelectorAll('.mailopt')[1].click();
    expect(acts).toContain('answerMail');
    expect(p.open).toBe(false);
    expect(speed).toBe(2);

    p.openLetter(state(), 'L1');
    expect(p.onKey({ key: '1', preventDefault() {} })).toBe(true);
    expect(acts.filter((a) => a === 'answerMail')).toHaveLength(2);
    expect(p.letterOpen).toBe(false);
  });

  it('has no Decide later, no weeks line and no Escape exit; Archive (ignore) is the skip', () => {
    const { layer, p } = setup();
    p.openLetter(state(), 'L1');
    expect(layer.querySelector('.letterlater')).toBeNull();
    expect(layer.textContent).not.toMatch(/Answer within|goes quiet/);
    p.onKey({ key: 'Escape', preventDefault() {} });
    expect(p.letterOpen).toBe(true);
    const archive = [...layer.querySelectorAll('button')].find((b) => b.textContent.includes('Archive (ignore)'));
    archive.click();
    expect(acts).toContain('archiveMail');
    expect(p.letterOpen).toBe(false);
    expect(speed).toBe(2);
  });

  it('puts each choice number beside its label', () => {
    const { layer, p } = setup();
    p.openLetter(state(), 'L1');
    const opt = layer.querySelector('.mailopt.keyed');
    expect([...opt.children].map((c) => c.className)).toEqual(['ckey num', 'cbody']);
    expect(opt.querySelector('.cbody').textContent).toContain('Take the meeting');
  });

  it('a decision outranks it, and the letter returns once the decision is answered', () => {
    const { layer, p } = setup();
    p.openLetter(state(), 'L1');
    const d = { eventId: 'x', title: 'Pick one', text: 'Hmm.', choices: [{ label: 'A' }], subjectId: null };
    p.update(state({ pendingDecision: d }));
    expect(p.letterOpen).toBe(false);
    expect(layer.querySelector('.modal.decision h2').textContent).toBe('Pick one');
    p.update(state());
    expect(p.letterOpen).toBe(true);
  });

  it('closes itself when the letter was answered or expired elsewhere', () => {
    const { p } = setup();
    p.openLetter(state(), 'L1');
    p.update(state({ mail: [{ ...letter(), resolved: { choice: null, week: 4 } }] }));
    expect(p.letterOpen).toBe(false);
    expect(speed).toBe(2);
  });
});
