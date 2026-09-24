import { describe, it, expect } from 'vitest';
import { characterLook } from './look.js';
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
});
