import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

async function wardrobe(query) {
  vi.stubGlobal('location', { search: query });
  return import('./wardrobe.js');
}

test('ordinary play keeps modern clothing even for a saved historical career', async () => {
  const { wardrobeEra, WARDROBE_MODELS } = await wardrobe('');
  expect(wardrobeEra({ founding: { startEra: 'dotcom' }, era: { id: 'dotcom' } })).toBeNull();
  expect(WARDROBE_MODELS).toEqual([]);
});

test('plain eras keeps modern clothing until a historical career is selected', async () => {
  const { wardrobeEra } = await wardrobe('?eras');
  expect(wardrobeEra({ era: { id: 'dotcom' } })).toBeNull();
  const state = { founding: { startEra: 'dotcom' }, era: { id: 'dotcom' } };
  expect(wardrobeEra(state)).toBe('dotcom');
  state.era.id = 'web2';
  expect(wardrobeEra(state)).toBe('web2');
  for (const id of ['classic', 'chatgbt', 'agents', 'consolidation', 'plateau']) {
    state.era.id = id;
    expect(wardrobeEra(state)).toBeNull();
  }
});

test('fixed art previews dress mocks while saved careers follow their own era', async () => {
  const { wardrobeEra } = await wardrobe('?eras&eraArt=preinternet');
  expect(wardrobeEra({ era: { id: 'classic' } })).toBe('preinternet');
  expect(wardrobeEra({ founding: { startEra: 'web2' }, era: { id: 'web2' } })).toBe('web2');
});
