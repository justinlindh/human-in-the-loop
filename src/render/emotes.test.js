import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// A canvas stand-in that records each paint: the text drawn and the font active when drawn.
function fakeCanvas(fonts) {
  const log = [];
  const ctx = new Proxy({ font: '10px sans-serif' }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'fillText' || key === 'strokeText') return (text) => log.push({ op: key, text, font: target.font, loaded: fonts?.loaded ?? true });
      if (key === 'clearRect') return () => log.push({ op: 'clear' });
      return () => {};
    },
    set(target, key, v) { target[key] = v; return true; },
  });
  return { width: 0, height: 0, getContext: () => ctx, log };
}

// document.fonts with a load the test settles by hand.
function fakeFonts({ loaded = false } = {}) {
  const f = { loaded, loads: 0, settle: null };
  f.check = () => f.loaded;
  f.load = () => {
    f.loads++;
    return new Promise((resolve, reject) => {
      f.settle = { resolve: () => { f.loaded = true; resolve([{}]); }, empty: () => resolve([]), reject: () => reject(new Error('font failed')) };
    });
  };
  return f;
}

let canvases;
async function setup(fonts) {
  canvases = [];
  vi.resetModules();
  globalThis.document = { createElement: () => { const c = fakeCanvas(fonts); canvases.push(c); return c; }, fonts };
  return import('./emotes.js');
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const texts = (c) => c.log.filter((e) => e.op === 'fillText' || e.op === 'strokeText');
const lastPaint = (c) => { const i = c.log.map((e) => e.op).lastIndexOf('clear'); return c.log.slice(i + 1); };

describe('issue #752: text emotes repaint once their font loads', () => {
  const doc = globalThis.document;
  beforeEach(() => { canvases = []; });
  afterEach(() => { globalThis.document = doc; });

  it('with the font already loaded, zzz paints once in Fredoka and asks for nothing', async () => {
    const fonts = fakeFonts({ loaded: true });
    const { emoteTexture } = await setup(fonts);
    const t = emoteTexture('zzz');
    await flush();
    expect(fonts.loads).toBe(0);
    expect(t.version).toBe(1);
    expect(texts(canvases[0]).length).toBeGreaterThan(0);
    expect(texts(canvases[0]).every((e) => e.loaded && /Fredoka/.test(e.font))).toBe(true);
  });

  it('a font that arrives after the texture was made repaints it and re-uploads', async () => {
    const fonts = fakeFonts();
    const { emoteTexture } = await setup(fonts);
    const t = emoteTexture('zzz');
    const before = t.version;
    expect(texts(canvases[0]).every((e) => !e.loaded)).toBe(true);
    fonts.settle.resolve();
    await flush();
    expect(t.version).toBe(before + 1);
    expect(lastPaint(canvases[0]).filter((e) => e.op === 'fillText' || e.op === 'strokeText').every((e) => e.loaded)).toBe(true);
  });

  it('either arrival order ends on the same painted picture', async () => {
    const early = fakeFonts({ loaded: true });
    let m = await setup(early);
    m.emoteTexture('zzz');
    const a = lastPaint(canvases[0]).map(({ op, text, font }) => ({ op, text, font }));
    const late = fakeFonts();
    m = await setup(late);
    m.emoteTexture('zzz');
    late.settle.resolve();
    await flush();
    const b = lastPaint(canvases[0]).map(({ op, text, font }) => ({ op, text, font }));
    expect(b).toEqual(a);
    expect(lastPaint(canvases[0]).every((e) => !('loaded' in e) || e.loaded)).toBe(true);
  });

  it('a font that fails to load keeps the fallback, with no rejection left unhandled', async () => {
    const fonts = fakeFonts();
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const { emoteTexture } = await setup(fonts);
      const t = emoteTexture('zzz');
      const v = t.version;
      fonts.settle.reject();
      await flush();
      expect(t.version).toBe(v);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('a load that resolves without the face (unavailable) keeps the fallback', async () => {
    const fonts = fakeFonts();
    const { emoteTexture } = await setup(fonts);
    const t = emoteTexture('zzz');
    const v = t.version;
    fonts.settle.empty();
    await flush();
    expect(t.version).toBe(v);
  });

  it('repeated and concurrent requests share one texture, one load and one repaint', async () => {
    const fonts = fakeFonts();
    const { emoteTexture, emoteMaterial } = await setup(fonts);
    const t = emoteTexture('zzz');
    expect(emoteTexture('zzz')).toBe(t);
    expect(emoteMaterial('zzz').map).toBe(t);
    expect(emoteMaterial('zzz')).toBe(emoteMaterial('zzz'));
    expect(canvases.length).toBe(1);
    expect(fonts.loads).toBe(1);
    const v = t.version;
    fonts.settle.resolve();
    await flush();
    expect(t.version).toBe(v + 1);
    expect(canvases[0].log.filter((e) => e.op === 'clear').length).toBe(2);
  });

  it('emotes without text never wait on a font and paint once', async () => {
    const fonts = fakeFonts();
    const { emoteTexture, EMOTES } = await setup(fonts);
    for (const k of EMOTES.filter((k) => k !== 'zzz')) emoteTexture(k);
    await flush();
    expect(fonts.loads).toBe(0);
    for (const c of canvases) expect(c.log.filter((e) => e.op === 'clear').length).toBe(1);
  });

  it('works where the page has no font loading API', async () => {
    const { emoteTexture } = await setup(undefined);
    expect(emoteTexture('zzz').version).toBe(1);
  });
});
