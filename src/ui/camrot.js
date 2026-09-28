// Two buttons that turn the camera a quarter at a time, the same as Q and E. They show only when the
// renderer offers rotateView(dir). The first time the player enters build mode, a bubble points at them.
import { h } from './dom.js';
import { icon } from './icons.js';
import { setTip } from './tooltip.js';

const HINT_KEY = 'hitl.rotateHintDone';

export function createCamRotate({ layer, controls, sfx }) {
  const R = () => controls.renderer ?? controls.getRenderer?.() ?? null;
  const turn = (dir) => {
    R()?.rotateView?.(dir);
    sfx?.('click');
    hideHint();
  };
  const left = h('button.btn.small.camrot-b', { 'aria-label': 'Turn the view left', onclick: () => turn(-1) }, icon('refresh', { size: 18 }));
  const right = h('button.btn.small.camrot-b', { 'aria-label': 'Turn the view right', onclick: () => turn(1) }, icon('refresh', { size: 18 }));
  left.classList.add('ccw');
  setTip(left, 'Turn the view left (Q)');
  setTip(right, 'Turn the view right (E)');
  const hint = h('div.camhint', null, 'Turn the view to reach every spot', h('span.small', { text: ' (Q and E on a keyboard)' }));
  const pad = h('div.camrot', { dataset: { occludes: '' } }, hint, left, right);
  pad.style.display = 'none';
  hint.style.display = 'none';
  layer.append(pad);

  let shown = null;
  let hintTimer = 0;
  function hideHint() {
    if (hint.style.display === 'none') return;
    hint.style.display = 'none';
    clearTimeout(hintTimer);
  }

  return {
    // Cheap per frame: only flips visibility when it changes. covered: a panel, modal or card is open
    // over the scene (on phones the pad would sit on a panel's close button).
    update(covered = false) {
      const on = typeof R()?.rotateView === 'function' && !covered;
      if (on === shown) return;
      shown = on;
      pad.style.display = on ? '' : 'none';
    },
    // Called on entering build mode: the bubble shows once per browser.
    buildHint() {
      // Build mode has just closed the panel it came from; the next update agrees.
      if (typeof R()?.rotateView !== 'function') return;
      shown = true;
      pad.style.display = '';
      let done = false;
      try { done = localStorage.getItem(HINT_KEY) === '1'; } catch { /* no storage: show it this time */ }
      if (done) return;
      try { localStorage.setItem(HINT_KEY, '1'); } catch { /* shows again next visit */ }
      hint.style.display = '';
      clearTimeout(hintTimer);
      hintTimer = setTimeout(hideHint, 9000);
    },
    hideHint,
  };
}
