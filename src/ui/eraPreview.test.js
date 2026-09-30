// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { history.replaceState({}, '', '/'); vi.resetModules(); });

it.each([['', false], ['?era=agents', false], ['?eras', true], ['?eras=1', true], ['?eras=0', true]])('reads presence of the eras parameter at startup: %s', async (query, enabled) => {
  history.replaceState({}, '', `/${query}`);
  vi.resetModules();
  const { erasPreview } = await import('./eraPreview.js');
  expect(erasPreview).toBe(enabled);
  history.replaceState({}, '', enabled ? '/' : '/?eras');
  expect((await import('./eraPreview.js')).erasPreview).toBe(enabled);
});
