// The visible UI panels of a page, shared by onscreen.mjs and play.mjs. listPanels runs in the page
// (so it is self-contained); PANELS_INSTALL defines it there as window.__listPanels(finish).
//
// A panel is a visible, named (id or class) element other than a button, up to three levels under the
// UI root (#ui), at least 24x12 px and smaller than most of the window: { el, text (its first line),
// rect [left, top, width, height] in pixels }. finish = true first finishes CSS transitions (they run
// on wall time, not the harness clock), so each panel is read as it settles; false reads them as they
// are, leaving playback untouched.
export function listPanels(finish) {
  const shown = (el) => el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  const root = document.getElementById('ui');
  if (finish) for (const a of document.getAnimations()) { try { a.finish(); } catch { /* an endless animation stays */ } }
  const out = [];
  const visit = (el, depth) => {
    for (const c of el.children) {
      if (!shown(c) || c.tagName === 'BUTTON' || /\bspacer\b/.test(c.className)) continue;
      const r = c.getBoundingClientRect();
      const named = c.id || (typeof c.className === 'string' && c.className.trim());
      const whole = r.width * r.height > 0.8 * innerWidth * innerHeight;
      if (named && !whole && r.width >= 24 && r.height >= 12 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight) {
        out.push({ el: c.id ? `#${c.id}` : `.${c.className.trim().split(/\s+/).join('.')}`, text: (c.innerText || '').trim().split('\n')[0].slice(0, 70), rect: [r.left, r.top, r.width, r.height].map((v) => Math.round(v)) });
      }
      if (depth < 2) visit(c, depth + 1);
    }
  };
  if (root) visit(root, 0);
  return out;
}
export const PANELS_INSTALL = `window.__listPanels = ${listPanels.toString()};`;
