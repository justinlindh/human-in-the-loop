import { describe, it, expect } from 'vitest';
import { ICONS } from './icons.js';
import { iconArt } from './tools/icon-art.js';
import { CATEGORIES, CHANNELS, FUNCTIONS, MOOD_INFO } from './content.js';
import { CATALOG, ERAS } from './v2content.js';
import { MENU } from './menu.js';
import { RESEARCH } from '../data/research.js';
import { TRAINING } from '../data/training.js';
import { postIcon } from './yakPosts.js';

// The founder's quick posts, once the sim ships them.
const POSTS = Object.values(import.meta.glob('../data/posts.js', { eager: true }))[0]?.POSTS ?? [];

const { art, missing } = iconArt();
const known = (name) => name in ICONS || art.has(name);

// The UI builds these names from game data (icon(`channel.${id}`) and so on), so a new data row
// with no icon only shows up in play. Each family lists every id the data can produce.
const FAMILIES = {
  channel: CHANNELS.map((c) => c.id),
  item: Object.keys(CATALOG),
  era: ERAS.map((e) => e.id),
  cat: CATEGORIES.map((c) => c.id),
  fn: FUNCTIONS,
  mood: Object.keys(MOOD_INFO),
  menu: MENU.map((m) => m.id),
  research: Object.keys(RESEARCH),
  train: Object.keys(TRAINING),
  arrow: ['up', 'down', 'flat'],
};

describe('icons', () => {
  it('has a file for every manifest entry', () => {
    expect(missing).toEqual([]);
  });

  it('has a glyph for every quick post icon', () => {
    expect(POSTS.map((p) => postIcon(p.icon)).filter((n) => !known(n))).toEqual([]);
  });

  it.each(Object.entries(FAMILIES))('names every %s icon the game data can ask for', (family, ids) => {
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.map((id) => `${family}.${id}`).filter((n) => !known(n))).toEqual([]);
  });
});
