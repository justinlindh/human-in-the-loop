// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { history.replaceState({}, '', '/'); vi.resetModules(); });

it.each([['', true], ['?era=agents', true], ['?eras', true], ['?eras=1', true], ['?eras=0', false], ['?eras=off', false], ['?eras=false', false]])('era starts are on unless turned off at startup: %s', async (query, enabled) => {
  history.replaceState({}, '', `/${query}`);
  vi.resetModules();
  const { erasPreview } = await import('./eraPreview.js');
  expect(erasPreview).toBe(enabled);
  history.replaceState({}, '', enabled ? '/?eras=0' : '/');
  // Read once: a later URL change does not flip it.
  expect((await import('./eraPreview.js')).erasPreview).toBe(enabled);
});
