// Tooltips for people and placed items in the 3D office, in the same look as every other tip.
// Desktop: hover a character or an item for a moment. Touch: long-press it (the release then does
// not open Staff or the item card, which a plain tap still does). The renderer says what is under
// the pointer (pick) and where it is on screen (screenRectOf); the text comes from game state.
import { MOOD_INFO, roleName } from './content.js';
import { CATALOG } from './v2content.js';
import { doingText } from './panels/common.js';
import { effectWords } from './panels/office.js';

const HOVER_MS = 300;
const LONG_MS = 450;
const MOVE_PX = 10;

export function sceneTipText(state, hit) {
  if (hit?.kind === 'staff') {
    const p = state?.staff?.find((x) => x.id === hit.id);
    if (!p) return '';
    const mood = MOOD_INFO[p.mood]?.name;
    return [p.name, `${roleName(p.role)}, level ${p.level}${mood ? ` · ${mood}` : ''}`, doingText(state, p)].join('\n');
  }
  if (hit?.kind === 'item') {
    const placed = state?.office?.placed?.find((x) => x.id === hit.id);
    const it = placed && CATALOG[placed.itemId];
    if (!it) return '';
    const lv = placed.level ?? 1;
    const eff = effectWords(it.effects?.[lv - 1] ?? {});
    return [it.name, it.costs?.length > 1 ? `Level ${lv}${eff ? `: ${eff}` : ''}` : eff || it.desc || ''].filter(Boolean).join('\n');
  }
  return '';
}

export function createSceneTips({ tooltips, getRenderer, getState, isBlocked }) {
  const isScene = (e) => e.target?.id === 'scene';
  let hoverKey = null, timer = 0, frame = 0, last = null;
  let press = null, eaten = false;

  const keyOf = (hit) => (hit?.kind && hit.id ? `${hit.kind}:${hit.id}` : null);
  const anchor = (hit) => ({
    key: keyOf(hit),
    rect: () => getRenderer()?.screenRectOf?.(hit) ?? null,
    text: () => sceneTipText(getState(), hit),
  });
  const pickAt = (x, y) => getRenderer()?.pick?.(x, y) ?? null;

  function resetHover() {
    clearTimeout(timer);
    hoverKey = null;
    if (tooltips.sceneBy === 'hover') tooltips.hide();
  }

  // Mouse and pen hover, sampled once a frame.
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') {
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_PX) { clearTimeout(press.timer); press = null; }
      return;
    }
    if (!isScene(e) || isBlocked()) { if (hoverKey) resetHover(); return; }
    last = e;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const hit = pickAt(last.clientX, last.clientY);
      const key = keyOf(hit);
      if (key === hoverKey) return;
      resetHover();
      hoverKey = key;
      if (key) timer = setTimeout(() => { if (hoverKey === key && !isBlocked()) tooltips.showScene(anchor(hit), 'hover'); }, HOVER_MS);
    });
  }, true);
  addEventListener('pointerout', (e) => { if (isScene(e) && e.pointerType !== 'touch') resetHover(); }, true);

  // Touch long-press.
  addEventListener('pointerdown', (e) => {
    eaten = false;
    clearTimeout(press?.timer);
    press = null;
    if (e.pointerType === 'mouse' || !isScene(e) || isBlocked()) return;
    const x = e.clientX, y = e.clientY;
    press = {
      x, y, timer: setTimeout(() => {
        const hit = pickAt(x, y);
        if (keyOf(hit)) { tooltips.showScene(anchor(hit), 'touch'); eaten = true; }
      }, LONG_MS),
    };
  }, true);
  const end = () => { clearTimeout(press?.timer); press = null; };
  addEventListener('pointerup', end, true);
  addEventListener('pointercancel', end, true);

  return {
    // True once after a long-press showed a tip, so the release does not also act as a tap.
    eatTap() { const v = eaten; eaten = false; return v; },
  };
}
