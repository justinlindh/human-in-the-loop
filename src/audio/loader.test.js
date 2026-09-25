import { describe, it, expect, vi, afterEach } from 'vitest';
import { createLoader, ASSETS, VOICE_RATE } from './loader.js';

const buf = (rate, seconds, ch = 1) => ({ length: Math.round(rate * seconds), numberOfChannels: ch, sampleRate: rate, duration: seconds });
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  const ctx = { sampleRate: 48000, decodeAudioData: vi.fn(async () => buf(48000, 2, 2)), createBuffer: (ch, len, rate) => ({ ...buf(rate, len / rate, ch), getChannelData: () => new Float32Array(len) }) };
  const offline = [];
  globalThis.OfflineAudioContext = class { constructor(ch, len, rate) { this.sampleRate = rate; offline.push(this); } async decodeAudioData() { return buf(this.sampleRate, 2, 1); } };
  globalThis.fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  return { ctx, offline, loader: createLoader(ctx) };
}

afterEach(() => { delete globalThis.OfflineAudioContext; delete globalThis.fetch; });

const voiceId = `voice/${Object.keys(ASSETS.voice ?? {})[0]}`;
const musicIds = Object.entries(ASSETS.music ?? {}).map(([era, m]) => `music/${era}/${m.beds[0].id}`);

describe('audio loader memory', () => {
  it('decodes voice banks at the voice rate and everything else at the context rate', async () => {
    const { ctx, loader } = setup();
    loader.preload([voiceId, musicIds[0], 'voice/crowd']);
    await flush(); await flush();
    expect(loader.get(voiceId).sampleRate).toBe(VOICE_RATE);
    expect(loader.get(musicIds[0]).sampleRate).toBe(48000);
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(ASSETS.crowd?.file ? 2 : 1);
  });

  it('releases matching buffers and reloads them on the next use', async () => {
    const { loader } = setup();
    loader.preload(musicIds.slice(0, 2));
    await flush(); await flush();
    expect(loader.loaded()).toEqual(musicIds.slice(0, 2));
    const before = loader.bytes();
    loader.release((id) => id === musicIds[0]);
    expect(loader.loaded()).toEqual([musicIds[1]]);
    expect(loader.bytes()).toBeLessThan(before);
    expect(loader.ready(musicIds[0])).toBe(false);
    loader.preload([musicIds[0]]);
    await flush(); await flush();
    expect(loader.ready(musicIds[0])).toBe(true);
  });
});
