import { describe, it, expect } from 'vitest';
import { voiceDetail, decodeEnv } from './voiceevent.js';
import { ASSETS } from './loader.js';
import env from './voice-env.json';

describe('hitl:voice detail', () => {
  it('has a loudness track for every shipped take, one value per 1/30 s', () => {
    const regen = 'run `node src/audio/voice-env.mjs` after changing a voice bank';
    for (const [bank, v] of Object.entries(ASSETS.voice)) {
      for (const [emo, takes] of Object.entries(v.emotions)) {
        expect(env.banks[bank]?.[emo], `${bank} ${emo} has no loudness tracks: ${regen}`).toHaveLength(takes.length);
        takes.forEach(([, d], i) => expect(env.banks[bank][emo][i], `${bank} ${emo} take ${i} is the wrong length: ${regen}`).toHaveLength(Math.max(1, Math.round(d * env.rate))));
      }
    }
  });

  it('peaks at 1 per take and stays within 0..1', () => {
    for (const b of Object.values(env.banks)) for (const e of Object.values(b)) for (const s of e) {
      const l = decodeEnv(s);
      expect(Math.max(...l)).toBe(1);
      expect(Math.min(...l)).toBeGreaterThanOrEqual(0);
    }
  });

  it('describes a delivered bark: speaker, emotion, take, lead and envelope', () => {
    const bank = Object.keys(ASSETS.voice)[0];
    const [, d] = ASSETS.voice[bank].emotions.happy[1];
    const c = { file: `voice/${bank}`, voiceKey: 's7' };
    const det = voiceDetail(c, { emotion: 'happy', takeIndex: 1, seconds: d, startsIn: 0.25 });
    expect(det).toMatchObject({ staffId: 's7', emotion: 'happy', take: 1, startsIn: 0.25, seconds: d, rate: 30 });
    expect(det.loudness).toEqual(decodeEnv(env.banks[bank].happy[1]));
  });

  it('gives a placeholder bark a flat envelope of its length and never a negative lead', () => {
    const det = voiceDetail({ file: 'voice/fem_nobody', voiceKey: 's1' }, { emotion: 'sighing', takeIndex: null, seconds: 1.5, startsIn: -0.4 });
    expect(det.startsIn).toBe(0);
    expect(det.take).toBeNull();
    expect(det.loudness).toHaveLength(45);
    expect(new Set(det.loudness).size).toBe(1);
  });
});
