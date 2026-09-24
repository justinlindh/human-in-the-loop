// Worker: encodes portrait pixels to PNG off the main thread.
// In: { id, w, h, pixels: ArrayBuffer (premultiplied RGBA, bottom-up rows) }  Out: { id, blob }
self.onmessage = async (e) => {
  const { id, w, h, pixels } = e.data;
  const src = new Uint8ClampedArray(pixels);
  const flipped = new Uint8ClampedArray(src.length);
  const row = w * 4;
  for (let y = 0; y < h; y++) flipped.set(src.subarray((h - 1 - y) * row, (h - y) * row), y * row);
  // The WebGL canvas holds premultiplied alpha; ImageData expects straight alpha.
  for (let i = 0; i < flipped.length; i += 4) {
    const a = flipped[i + 3];
    if (a === 0 || a === 255) continue;
    const k = 255 / a;
    flipped[i] *= k; flipped[i + 1] *= k; flipped[i + 2] *= k;
  }
  const c = new OffscreenCanvas(w, h);
  c.getContext('2d').putImageData(new ImageData(flipped, w, h), 0, 0);
  const blob = await c.convertToBlob({ type: 'image/png' });
  self.postMessage({ id, blob });
};
