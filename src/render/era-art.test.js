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

test('without eras no era art loads or shows, even for a saved era career', async () => {
  const m = await eraArt('');
  expect(m.ERA_ART_MODELS).toEqual([]);
  m.syncEraArt(dotcom());
  expect(m.eraArtActive()).toBe(false);
});

test('a fixed preview dresses mocks in the selected era', async () => {
  const m = await eraArt('?eras&eraArt=web2');
  expect(m.syncEraArt({ era: { id: 'classic' }, founding: {} })).toBe('web2');
  expect(m.eraArtActive()).toBe(true);
});
