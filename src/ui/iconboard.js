import { h } from './dom.js';
import { ICONS, icon, iconFallbacks } from './icons.js';

// ?icons=1: the whole icon set at 16, 24, and 48 px on light and dark panels, with names that
// still fall back to an emoji outlined in red.
export function showIconBoard(layer) {
  const board = h('div.iconboard');
  const render = () => {
    const missing = new Set(iconFallbacks());
    const names = Object.keys(ICONS).sort();
    const cell = (n, dark) => h(`div.ib-cell${missing.has(n) ? '.missing' : ''}${dark ? '.dark' : ''}`, { title: n },
      h('div.ib-icons', null, icon(n, { size: 16 }), icon(n, { size: 24 }), icon(n, { size: 48 })),
      h('span.ib-name', { text: n }));
    board.replaceChildren(
      h('div.ib-head', null, h('b', { text: `Icons: ${names.length}` }), ` · ${names.length - missing.size} art · `,
        h('span.bad-t', { text: `${missing.size} emoji fallbacks` })),
      h('div.ib-grid', null, ...names.map((n) => cell(n, false))),
      h('div.ib-grid.dark', null, ...names.map((n) => cell(n, true))));
  };
  render();
  addEventListener('hitl:icons', render);
  layer.append(board);
}
