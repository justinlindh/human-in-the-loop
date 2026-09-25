import { describe, it, expect } from 'vitest';
import { B } from '../../src/sim/balance.js';
import { runBot } from '../../src/sim/bots.js';
import { tick } from '../../src/sim/index.js';
import { article } from '../../src/sim/util.js';
import { fillChat, chatSystem } from '../../src/sim/chat.js';
import { postureParts } from '../../src/sim/incidents.js';
import { itemBonus } from '../../src/sim/bonus.js';
import { makeCtx } from '../../src/sim/registry.js';
import { TALK } from '../../src/data/talk.js';
import { game, addStaff, addProduct, setItems } from './helpers.js';

describe('every chat line players see is filled and grammatical', () => {
  it('no braces and no "a" before a vowel sound in any chat event over full bot runs', () => {
    let lines = 0;
    // Two seeds per bot over ten years cover every era's chat; each week's chat is checked as it happens.
    for (const name of ['automateAll', 'balanced']) {
      for (const seed of [1, 2]) {
        runBot(name, seed, 520, {
          onWeek: (s, events) => {
            for (const e of events) {
              if (e.type !== 'chat') continue;
              lines++;
              expect(e.text, e.text).not.toMatch(/[{}]/);
              expect(e.text, e.text).not.toMatch(/\ba (Email|Analytics|HR|Accounting|Architect|Incident|AI-native|Autonomous|Observability|Onboarding|Espresso|Arcade)\b/);
            }
          },
        });
      }
    }
    expect(lines).toBeGreaterThan(500);
  });
});

describe('article', () => {
  it('follows pronunciation', () => {
    expect(article('Email')).toBe('an Email');
    expect(article('HR')).toBe('an HR');
    expect(article('MRR')).toBe('an MRR');
    expect(article('SLA')).toBe('an SLA');
    expect(article('UX Lead')).toBe('a UX Lead');
    expect(article('user')).toBe('a user');
    expect(article('hour')).toBe('an hour');
    expect(article('CRM')).toBe('a CRM');
    expect(article('Support Desk')).toBe('a Support Desk');
  });

  it('fillChat fixes the article before a filled word', () => {
    const s = game();
    addProduct(s, { category: 'email' });
    expect(fillChat(s, s.rng, 'Someone launched a {category} clone', {})).toBe('Someone launched an Email clone');
    const t = game();
    addProduct(t, { category: 'crm' });
    expect(fillChat(t, t.rng, 'Someone launched a {category} clone', {})).toBe('Someone launched a CRM clone');
  });
});

describe('threads', () => {
  it('cool down for about a year, longer for final_v2', () => {
    const s = game();
    const base = TALK.find((t) => t.id === 'standup');
    expect(base.cooldown ?? B.exchangeCooldownWeeks).toBeGreaterThanOrEqual(52);
    expect(TALK.find((t) => t.id === 'final_v2').cooldown).toBeGreaterThanOrEqual(104);
    expect(s).toBeTruthy();
  });

  it('mentee_thanks can fire: a mentored junior posts and their mentor replies', () => {
    const s = game(2);
    const j = addStaff(s, 'engineer', 'junior');
    const m = s.staff.find((p) => p.seniority === 'senior');
    m.assignment = { type: 'mentor', targetId: j.id };
    const t = TALK.find((x) => x.id === 'mentee_thanks');
    const opener = (text) => t.turns[0][1].some((v) => text.startsWith(v.split('{')[0].slice(0, 20)));
    let fired = false;
    for (let w = 0; w < 400 && !fired; w++) {
      const c = makeCtx(s);
      chatSystem(c);
      for (const x of TALK) if (x.id !== 'mentee_thanks') (s.flags.talk.cd[x.id] = 1e9);
      const root = c.events.find((e) => e.type === 'chat' && e.fromId === j.id && e.replyTo === null && opener(e.text));
      if (root) {
        fired = true;
        expect(c.events.some((e) => e.replyTo === root.id && e.fromId === m.id)).toBe(true);
      }
      s.week++;
    }
    expect(fired).toBe(true);
    expect(t.cast).toEqual({ a: 'junior', b: 'mentorOf' });
  });
});

describe('small rules', () => {
  it('postureParts counts the people on security', () => {
    const s = game();
    addStaff(s, 'security', 'mid', { assignment: { type: 'security', targetId: null } });
    addStaff(s, 'security', 'mid', { assignment: { type: 'security', targetId: null } });
    expect(postureParts(s).people).toBe(2);
  });

  it('stacked item copies never move one key more than 50%', () => {
    const s = game();
    setItems(s, [{ id: 'a', itemId: 'nap_pod', level: 3 }, { id: 'b', itemId: 'nap_pod', level: 3 }]);
    expect(itemBonus(s, 'burnoutResign')).toBeCloseTo(-0.5);
    setItems(s, [{ id: 'a', itemId: 'espresso', level: 3 }, { id: 'b', itemId: 'espresso', level: 3 }]);
    expect(itemBonus(s, 'staminaRecovery')).toBeCloseTo(0.5);
  });
});
