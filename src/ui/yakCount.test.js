import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { countsAsNew } from './yakCount.js';
import { B } from '../sim/balance.js';

// Every switch is off unless a test turns it on.
const real = B.pacing;
beforeEach(() => { B.pacing = {}; });
afterEach(() => { B.pacing = real; });

const chatter = { from: 'Sam', text: 'lunch?' };
const reply = { ...chatter, replyTo: 'c1', priority: true };

describe('Yak unread counting', () => {
  it('All counts everything', () => {
    expect(countsAsNew(chatter, 'general', 'all')).toBe(true);
    expect(countsAsNew(reply, 'general', 'all')).toBe(true);
  });
  it('Important counts priority replies, incidents and wins, not chatter', () => {
    expect(countsAsNew(reply, 'general', 'important')).toBe(true);
    expect(countsAsNew(chatter, 'incidents', 'important')).toBe(true);
    expect(countsAsNew(chatter, 'wins', 'important')).toBe(true);
    expect(countsAsNew(chatter, 'general', 'important')).toBe(false);
  });
  it('quietYak: flavour never counts at All, incidents, wins and replies still do', () => {
    B.pacing = { quietYak: true };
    expect(countsAsNew(chatter, 'general', 'all')).toBe(false);
    expect(countsAsNew(chatter, 'random', 'all')).toBe(false);
    expect(countsAsNew(chatter, 'incidents', 'all')).toBe(true);
    expect(countsAsNew(chatter, 'wins', 'all')).toBe(true);
    expect(countsAsNew(reply, 'general', 'all')).toBe(true);
    expect(countsAsNew({ ...chatter, important: true }, 'general', 'all')).toBe(true);
    B.pacing = { quietYak: false };
    expect(countsAsNew(chatter, 'general', 'all')).toBe(true);
  });
  it('Off counts nothing', () => {
    expect(countsAsNew(reply, 'incidents', 'off')).toBe(false);
    expect(countsAsNew(chatter, 'general', 'off')).toBe(false);
  });
});
