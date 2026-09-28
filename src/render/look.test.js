import { describe, it, expect } from 'vitest';
import { characterLook, PRINTS } from './look.js';
import { DESIGNS } from './prints.js';
import { ROLE_COLORS } from './palette.js';

const base = { skin: 2, hair: 3, hairColor: '#7a4b2a', shirt: '#9b6bff', pants: '#2e3440', accessory: 'none', build: 1 };

describe('characterLook', () => {
  it('returns hex colours and the role colour', () => {
    const l = characterLook(base, 'engineer');
    for (const k of ['skin', 'hairColor', 'shirt', 'pants']) expect(l[k]).toMatch(/^#[0-9a-f]{6}$/);
    expect(l.roleColor).toBe(ROLE_COLORS.engineer);
    expect(l.garment).toBe('hood');
  });
  it('swaps a shirt that clashes with the role colour, the same way every time', () => {
    const a = characterLook({ ...base, shirt: ROLE_COLORS.support }, 'support');
    const b = characterLook({ ...base, shirt: ROLE_COLORS.support }, 'support');
    expect(a.shirt).not.toBe(characterLook({ ...base, shirt: ROLE_COLORS.support }, 'designer').shirt);
    expect(a.shirt).toBe(b.shirt);
  });
  it('gives support only its headset, but lets it keep glasses', () => {
    expect(characterLook({ ...base, accessory: 'cap' }, 'support').accessory).toBe('none');
    expect(characterLook({ ...base, accessory: 'headphones' }, 'support').accessory).toBe('none');
    expect(characterLook({ ...base, accessory: 'glasses' }, 'support').accessory).toBe('glasses');
  });
  it('colours hats from the look, and honours capBack', () => {
    const cap = characterLook({ ...base, accessory: 'cap' }, 'designer');
    expect(cap.hatColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(characterLook({ ...base, accessory: 'cap', capBack: true }, 'designer').capBack).toBe(true);
    expect(characterLook({ ...base, accessory: 'none' }, 'designer').hatColor).toBe(null);
  });
  it('tucks the hood for engineers with long hair', () => {
    expect(characterLook({ ...base, hair: 2 }, 'engineer').garment).toBe('hood_tucked');
    expect(characterLook({ ...base, hair: 2, accessory: 'beanie' }, 'engineer').garment).toBe('hood');
  });

  // Every sim appearance: skins, hair 0..7, hair colours, shirts (src/sim/staff.js ranges).
  const HAIRC = ['#2b1d16', '#4a3222', '#7a4b2a', '#c68b4e', '#e8c170', '#b8b8b8', '#1c1c24', '#a3442f'];
  const SHIRTS = ['#4f8cff', '#ff7eb6', '#ffb020', '#34c38f', '#e5484d', '#9b6bff', '#f2efe6', '#2f3a4a', '#7fc8c0', '#d98c5f'];
  const looks = [];
  for (let hair = 0; hair < 8; hair++) for (const hairColor of HAIRC) for (const shirt of SHIRTS) looks.push({ ...base, hair, hairColor, shirt, skin: hair % 6 });

  it('moves some looks onto the extra hair styles, and keeps the rest on the sim\'s own', () => {
    const styles = looks.map((a) => characterLook(a, 'designer').hair);
    const extra = styles.filter((h) => h >= 8).length / styles.length;
    expect(new Set(styles.filter((h) => h >= 8))).toEqual(new Set([8, 9, 10, 11, 12]));
    expect(extra).toBeGreaterThan(0.25);
    expect(extra).toBeLessThan(0.5);
    looks.forEach((a, i) => { if (styles[i] < 8) expect(styles[i]).toBe(a.hair); });
    expect(looks.map((a) => characterLook(a, 'designer').hair)).toEqual(styles);
  });
  it('under headphones or a support headset, gives only the buzz cut of the extra styles', () => {
    for (const a of looks) {
      for (const [app, role] of [[{ ...a, accessory: 'headphones' }, 'engineer'], [a, 'support']]) {
        const h = characterLook(app, role).hair;
        expect(h < 8 || h === 11).toBe(true);
      }
    }
  });
  it('prints a role graphic on most shirts that show, and none under a tie, vest or blazer', () => {
    for (const role of ['sales', 'security', 'marketer']) for (const a of looks) expect(characterLook(a, role).print).toBeNull();
    for (const role of Object.keys(PRINTS)) {
      const prints = looks.map((a) => characterLook(a, role).print);
      const share = prints.filter(Boolean).length / prints.length;
      expect(share).toBeGreaterThan(0.5);
      expect(share).toBeLessThan(0.8);
      expect(new Set(prints.filter(Boolean))).toEqual(new Set(PRINTS[role]));
    }
    for (const list of Object.values(PRINTS)) for (const d of list) expect(DESIGNS[d], d).toBeTypeOf('function');
  });
});
