import { describe, it, expect, beforeAll } from 'vitest';
import { runBot } from '../../src/sim/bots.js';
import { B } from '../../src/sim/balance.js';

// Bot posts count as important only when flagged (contract): the ones a player should see at any speed
// are flagged, and filler is not.
describe('issue #757: which bot posts are important', () => {
  const posts = [];
  beforeAll(() => {
    for (const seed of [1, 2, 3]) runBot('balanced', seed, 520, { onWeek: (s, ev) => { for (const e of ev) if (e.type === 'chat' && e.fromId === null) posts.push({ ...e, prompts: s.chatPrompts }); } });
  }, 120000);

  it('filler bots are never flagged', () => {
    const filler = posts.filter((e) => ['@hackerspewsbot', '@vendorbot'].includes(e.from));
    expect(filler.length).toBeGreaterThan(0);
    expect(filler.some((e) => e.important)).toBe(false);
  });

  it('a Yak prompt and its outcome are flagged', () => {
    const asked = posts.filter((e) => e.prompts?.some((p) => p.chatId === e.id));
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((e) => e.important)).toBe(true);
  });

  it('@launchbot announces a new product and every few versions, not every update', () => {
    const versions = posts.filter((e) => e.from === '@launchbot' && / v\d+ is live/.test(e.text)).map((e) => Number(e.text.match(/ v(\d+) is live/)[1]));
    expect(versions).toContain(1);
    expect(versions.every((v) => v === 1 || v % B.launchbotVersionStep === 0)).toBe(true);
  });

  it('news a player acts on is flagged: rivals and companies for sale', () => {
    const news = posts.filter((e) => /Just launched:|small companies are quietly for sale/.test(e.text));
    expect(news.length).toBeGreaterThan(0);
    expect(news.every((e) => e.important)).toBe(true);
  });
});
