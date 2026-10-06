// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fullscreenAvailable, fullscreenActive, toggleFullscreen, isStandalone } from './fullscreen.js';

const root = document.documentElement;
const clean = () => {
  delete root.requestFullscreen; delete root.webkitRequestFullscreen;
  delete document.exitFullscreen; delete document.webkitExitFullscreen;
  delete document.fullscreenElement; delete document.webkitFullscreenElement;
  delete window.navigator.standalone;
  vi.unstubAllGlobals();
};
afterEach(clean);

describe('full screen', () => {
  it('is unavailable without the API', () => {
    expect(fullscreenAvailable()).toBe(false);
  });

  it('is available with the standard calls', () => {
    root.requestFullscreen = vi.fn(); document.exitFullscreen = vi.fn();
    expect(fullscreenAvailable()).toBe(true);
  });

  it('falls back to the webkit-prefixed calls', async () => {
    root.webkitRequestFullscreen = vi.fn(() => Promise.resolve()); document.webkitExitFullscreen = vi.fn();
    expect(fullscreenAvailable()).toBe(true);
    expect(await toggleFullscreen()).toBeNull();
    expect(root.webkitRequestFullscreen).toHaveBeenCalled();
  });

  it('exits when already full screen', async () => {
    root.requestFullscreen = vi.fn(); document.exitFullscreen = vi.fn(() => Promise.resolve());
    document.fullscreenElement = root;
    expect(fullscreenActive()).toBe(true);
    expect(await toggleFullscreen()).toBeNull();
    expect(document.exitFullscreen).toHaveBeenCalled();
    expect(root.requestFullscreen).not.toHaveBeenCalled();
  });

  it('returns the refusal as a message', async () => {
    root.requestFullscreen = vi.fn(() => Promise.reject(new Error('Not allowed'))); document.exitFullscreen = vi.fn();
    expect(await toggleFullscreen()).toBe('Not allowed');
  });

  it('is hidden for an installed app', () => {
    root.requestFullscreen = vi.fn(); document.exitFullscreen = vi.fn();
    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true });
    expect(isStandalone()).toBe(true);
    expect(fullscreenAvailable()).toBe(false);
  });
});
