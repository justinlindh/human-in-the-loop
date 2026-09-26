// Helpers run inside the capture page and keep the real post tied to its rendered image and replies.
export function yakThread() {
  const post = window.__yakMeme;
  if (!post?.id || post.image?.id !== 'this_is_fine') throw new Error('yak: missing outage meme identity');
  const panel = document.querySelector('.chat.yak');
  const root = panel?.querySelector(`.msg[data-id="${CSS.escape(post.id)}"]`);
  const image = root?.querySelector('.ymeme-img');
  if (!image || !image.complete || image.naturalWidth !== 480 || image.naturalHeight !== 360 ||
      !new URL(image.currentSrc || image.src, location.href).pathname.endsWith(`/memes/${post.image.id}.webp`)) {
    throw new Error('yak: displayed meme is missing, undecoded or incorrect');
  }
  const messages = [...panel.querySelectorAll(`.msg[data-root="${CSS.escape(post.id)}"]`)];
  return { panel, root, image, messages };
}

export function assertYak({ replies = 2, crop = [0, 0, 1, 1], minImageWidth = 200 } = {}) {
  const { root, image, messages } = window.__yakThread();
  if (messages.filter(m => m !== root && m.querySelector('.mtext')?.textContent.trim()).length < replies) {
    throw new Error('yak: missing live thread replies');
  }
  const frame = { left: crop[0] * innerWidth, top: crop[1] * innerHeight,
    right: (crop[0] + crop[2]) * innerWidth, bottom: (crop[1] + crop[3]) * innerHeight };
  for (const el of [image, ...messages]) {
    const r = el.getBoundingClientRect();
    let bounds = { ...frame };
    for (let p = el; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.display === 'none' || s.visibility !== 'visible' || Number(s.opacity) < 0.99) throw new Error('yak: hidden thread');
      if (p !== el && /(auto|scroll|hidden|clip)/.test(s.overflowX + s.overflowY)) {
        const b = p.getBoundingClientRect();
        bounds = { left: Math.max(bounds.left, b.left), top: Math.max(bounds.top, b.top),
          right: Math.min(bounds.right, b.right), bottom: Math.min(bounds.bottom, b.bottom) };
      }
    }
    if (!r.width || !r.height || r.left < bounds.left - 1 || r.top < bounds.top - 1 ||
        r.right > bounds.right + 1 || r.bottom > bounds.bottom + 1) throw new Error('yak: thread outside crop or clipped');
    if (el === image && r.width < minImageWidth) throw new Error('yak: meme too small to read');
  }
  return { id: window.__yakMeme.id, image: window.__yakMeme.image.id, replies: messages.length - 1,
    width: image.getBoundingClientRect().width, decoded: [image.naturalWidth, image.naturalHeight] };
}

export function frameYak(seconds = 0) {
  const { panel, root, messages } = window.__yakThread();
  root.scrollIntoView({ block: 'start', behavior: 'instant' });
  const rs = [panel.querySelector('.chat-head'), ...messages].map(e => e.getBoundingClientRect());
  const left = Math.min(...rs.map(r => r.left)), right = Math.max(...rs.map(r => r.right));
  const top = Math.min(...rs.map(r => r.top)), bottom = Math.max(...rs.map(r => r.bottom));
  const k = Math.min(4, innerWidth * 0.85 / (right - left), innerHeight * 0.76 / (bottom - top));
  const pr = panel.getBoundingClientRect();
  panel.style.transformOrigin = '0 0';
  panel.style.transition = `transform ${seconds}s cubic-bezier(0.65, 0, 0.35, 1)`;
  const x = innerWidth / 2 - (left + right) / 2 * k + (k - 1) * pr.left;
  const y = innerHeight * 0.44 - (top + bottom) / 2 * k + (k - 1) * pr.top;
  panel.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
}

export const YAK_HELPERS = `window.__yakThread = ${yakThread.toString()}; window.__assertYak = ${assertYak.toString()}; window.__frameYak = ${frameYak.toString()};`;
export const YAK_CHECK = (at, options = {}) => ({ at, js: `(() => {
  const result = window.__assertYak(${JSON.stringify(options)});
  (window.__captureMarks ??= []).push({ t: ${at}, label: 'yak-image', ...result });
})()` });
