import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/sim/index.js';
import { MEMES, MEME_IDS } from '../../src/data/memes.js';
import { eraAllowsText } from '../../src/sim/eras.js';
import { game, classicGame, addStaff, addDesks, addProduct } from './helpers.js';

function office(s) {
  s.week = 60;
  s.cash = 1e6;
  addDesks(s, 6);
  for (const role of ['engineer', 'designer', 'marketer']) addStaff(s, role, 'mid', { hiredWeek: 0 });
  for (const p of s.staff) { p.mood = 'ok'; p.remote = false; }
  addProduct(s, { name: 'Inboxer', launchedWeek: 10 });
  return s;
}
const meme = (s) => {
  delete s.flags.posts;
  const res = dispatch(s, { type: 'postMessage', id: 'meme' });
  return res.events.find((e) => e.id === res.chatId);
};

describe('issue #671: image memes in Yak', () => {
  it('the set is 6 to 10 memes with unique ids, an image id and a short alt caption', () => {
    expect(MEMES.length).toBeGreaterThanOrEqual(6);
    expect(MEMES.length).toBeLessThanOrEqual(10);
    expect(new Set(MEME_IDS).size).toBe(MEMES.length);
    for (const m of MEMES) {
      expect(m.image, m.id).toMatch(/^[a-z_]+$/);
      expect(m.alt.length, m.id).toBeLessThanOrEqual(110);
      expect(m.alt, m.id).not.toMatch(/startup/i);
    }
  });

  it('a shared meme posts a picture whose alt is the text, from a meme that fits the moment', () => {
    const s = office(game(1));
    const post = meme(s);
    expect(post.image).toEqual({ id: expect.any(String), alt: post.text });
    expect(MEMES.some((m) => m.image === post.image.id && m.alt === post.text)).toBe(true);
  });

  it('during an outage it is always the burning server room', () => {
    const s = office(game(2));
    s.outage = { productId: s.products[0].id, kind: 'bad_deploy', severity: 2, weeks: 0, unrecoverable: false };
    for (let i = 0; i < 5; i++) { s.week += 3; expect(meme(s).image.id).toBe('this_is_fine'); }
  });

  it('the Classic era never gets an agent meme', () => {
    const s = office(classicGame(3));
    const seen = new Set();
    for (let i = 0; i < 40; i++) { s.week += 3; seen.add(meme(s).image.id); }
    for (const id of seen) {
      const m = MEMES.find((x) => x.image === id);
      expect(m.when, id).not.toBe('agents');
      expect(eraAllowsText(s, m.alt), id).toBe(true);
    }
  });

});
