import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

async function eraArt(query) {
  vi.stubGlobal('location', { search: query });
  return import('./era-art.js');
}

const dotcom = () => ({ founding: { startEra: 'dotcom' }, era: { id: 'dotcom' }, flags: { dotcom: { phase: 'boom' } } });

test('plain eras dresses a founded era career and leaves a Classic company alone', async () => {
  const m = await eraArt('?eras');
  expect(m.ERA_ART_MODELS.length).toBeGreaterThan(0);
  expect(m.ERA_MODELS_AT_START).toBe(true);
  expect(m.syncEraArt({ era: { id: 'classic' }, founding: {} })).toBe('classic');
  expect(m.eraArtActive()).toBe(false);
  expect(m.eraArtCrt('dotcom')).toBe(false);
  expect(m.syncEraArt(dotcom())).toBe('dotcom');
  expect(m.eraArtActive()).toBe(true);
  expect(m.eraArtCrt('dotcom')).toBe(true);
});

test('eraArtEra reads without changing what the renderer last synced', async () => {
  const m = await eraArt('?eras');
  m.syncEraArt(dotcom());
  m.eraArtEra({ era: { id: 'classic' }, founding: {} });
  expect(m.eraArtActive()).toBe(true);
});

test('without a flag a founded era career wears era art, loaded once it is wanted', async () => {
  const m = await eraArt('');
  expect(m.ERA_MODELS_AT_START).toBe(false);
  expect(m.eraArtWanted({ era: { id: 'classic' }, founding: {} })).toBe(false);
  expect(m.syncEraArt({ era: { id: 'classic' }, founding: {} })).toBe('classic');
  expect(m.eraArtActive()).toBe(false);
  expect(m.eraArtWanted(dotcom())).toBe(true);
  expect(m.syncEraArt(dotcom())).toBe('dotcom');
  expect(m.eraArtActive()).toBe(true);
});

test('eras=0 keeps the ordinary office, even for a saved era career or a preview', async () => {
  const m = await eraArt('?eras=0&eraArt=web2');
  expect(m.ERA_ART_PREVIEW).toBe(false);
  expect(m.ERA_MODELS_AT_START).toBe(false);
  expect(m.eraArtWanted(dotcom())).toBe(false);
  m.syncEraArt(dotcom());
  expect(m.eraArtActive()).toBe(false);
});

test('a fixed preview dresses mocks in the selected era', async () => {
  const m = await eraArt('?eras&eraArt=web2');
  expect(m.syncEraArt({ era: { id: 'classic' }, founding: {} })).toBe('web2');
  expect(m.eraArtActive()).toBe(true);
});
