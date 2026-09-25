import { describe, it, expect } from 'vitest';
import { autoQuality, deviceTraits, isPhone, isSoftwareRenderer } from './quality.js';

describe('autoQuality', () => {
  it('picks Low on software GL', () => {
    for (const s of [
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
      'Google SwiftShader',
      'llvmpipe (LLVM 19.1.7, 256 bits)',
      'Mesa softpipe',
      'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)',
    ]) expect(autoQuality(s), s).toBe('low');
  });
  it('picks High on a GPU or an unknown renderer', () => {
    for (const s of ['ANGLE (AMD, AMD Radeon RX 7900 XTX (radeonsi navi31 LLVM 19.1.7), OpenGL 4.6)', 'Apple M2', 'WebKit WebGL', '', null])
      expect(autoQuality(s), String(s)).toBe('high');
    expect(isSoftwareRenderer(undefined)).toBe(false);
  });
  it('picks Low on a phone even with a GPU', () => {
    const gpu = 'Apple GPU';
    expect(autoQuality(gpu, { coarse: true, shortSide: 390 })).toBe('low');
    expect(autoQuality(gpu, { coarse: true, shortSide: 412 })).toBe('low');
  });
  it('keeps High on tablets, desktops and touch laptops', () => {
    const gpu = 'Apple GPU';
    expect(autoQuality(gpu, { coarse: true, shortSide: 820 })).toBe('high');
    expect(autoQuality(gpu, { coarse: false, shortSide: 390 })).toBe('high');
    expect(autoQuality(gpu, { coarse: false, shortSide: 1080 })).toBe('high');
    expect(autoQuality(gpu)).toBe('high');
    expect(isPhone()).toBe(false);
  });
  it('reads the device from the browser', () => {
    const win = (coarse, w, h) => ({ matchMedia: (q) => ({ matches: q === '(pointer: coarse)' && coarse }), screen: { width: w, height: h } });
    expect(deviceTraits(win(true, 390, 844))).toEqual({ coarse: true, shortSide: 390 });
    expect(deviceTraits(win(false, 2560, 1440))).toEqual({ coarse: false, shortSide: 1440 });
    expect(deviceTraits({})).toEqual({});
  });
});
