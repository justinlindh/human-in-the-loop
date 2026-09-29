import { describe, it, expect } from 'vitest';
import { countsAsNew } from './yakCount.js';

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
  it('Off counts nothing', () => {
    expect(countsAsNew(reply, 'incidents', 'off')).toBe(false);
    expect(countsAsNew(chatter, 'general', 'off')).toBe(false);
  });
});
