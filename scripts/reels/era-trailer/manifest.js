// The capture manifest for the era segment: one item per beat of ./config.js, named `trailer-<beat id>`.
// The early eras open on pinned states (./snapshots, written by `node scripts/trailer/pin.mjs --trailer era`);
// the jump into the AI eras reuses the main trailer's own item.
import { PIN_PACING, CLEAN, CLEAR_CARDS, CHOOSE_WHEN, KEY, CLICK_STARTS } from '../../capture-manifest.js';
import { LOAD_PIN } from '../../trailer/pins.js';
import { ITEMS as MAIN } from '../../trailer/manifest.js';
import { BEATS, PIN_DIR } from './config.js';

const CARDS_AWAY = Array.from({ length: 30 }, (_, i) => ({ at: i + 0.2, js: CLEAR_CARDS }));

// An early era played live from its pinned state, side panels hidden. Decision cards stay up and are answered
// after 3 s, as a player would.
const early = (id, pin, extra = {}) => ({
  id, title: `Era segment: ${id}`, query: 'seed=7&speed=1&eras',
  setup: `(async () => { ${PIN_PACING} await ${LOAD_PIN(pin, PIN_DIR)}; ${CLEAN}; const st = document.createElement('style'); st.textContent = '#ui .moment-cap { bottom: 7% !important; font-size: 2.3em; background: #fbf5ea !important; color: #2a2630 !important; border: 0.1em solid #2a2630; border-radius: 0.7em !important; font-weight: 600; box-shadow: 0 0.14em 0 #2a2630 !important; } #ui .moment-cap .mcap-skip { display: none !important; }'; document.head.append(st); })()`,
  actions: [...CARDS_AWAY, ...CHOOSE_WHEN(null, 0, 1, 30, 3)],
  ...extra,
});

const OWN = [
  // The week the chatbot era starts: the game's own era card lands over the office.
  early('seg-ai', 'ai', { seconds: 10 }),
  // Reports > Inventory: 500 boxed copies on their way to the shelf.
  early('seg-inventory', 'inventory', {
    seconds: 6, actions: [...CARDS_AWAY, { at: 0.6, js: KEY('r', 'KeyR') }, { at: 1.4, js: CLICK_STARTS('Inventory') },
      { at: 2.4, js: "(() => { const t = document.body.textContent; if (!t.includes('500 copies due')) console.error('capture: the Inventory tab does not show the 500 copies on order'); })()" }],
  }),
  // The banker's float offer, over the sock-cat billboard.
  early('seg-float', 'float', { seconds: 14, actions: [...CARDS_AWAY, ...CHOOSE_WHEN(null, 0, 1, 30, 3),
    ...Array.from({ length: 26 }, (_, i) => ({ at: 0.5 + i / 2, js: "(() => { if (window.__HITL.state.pendingDecision?.eventId === 'dotcom_ipo_frenzy') window.__floatSeen = true; })()" })),
    { at: 13, js: "(() => { if (!window.__floatSeen) console.error('capture: the float offer never opened'); })()" }] }),
  // The millennium watch: the clock counts down to midnight about 14 to 17 s in.
  early('seg-y2k', 'y2k', { seconds: 30 }),
  // Build > Projects on a Web 2.0 company: the old-browser line on a project card.
  early('seg-web2', 'web2', {
    seconds: 8, actions: [...CARDS_AWAY, { at: 0.8, js: KEY('b', 'KeyB') }, { at: 1.6, js: CLICK_STARTS('Projects') },
      { at: 3, js: "(() => { if (!document.querySelector('.legacy-compat')) console.error('capture: no old-browser line on a project card'); })()" }],
  }),
];
const MAIN_ITEM = { 'real-era-chatgbt': 'trailer-era-chatgbt' };
const base = (name) => OWN.find((i) => i.id === name) ?? (MAIN_ITEM[name] && MAIN.find((i) => i.id === MAIN_ITEM[name]));

export const ITEMS = BEATS.filter((b) => b.item).map((b) => {
  const item = base(b.item);
  if (!item) throw new Error(`era segment: beat ${b.id} names unknown capture item ${b.item}`);
  return {
    ...item, ...b.capture, id: `trailer-${b.id}`, title: `Era segment: ${b.id}`,
    seconds: Math.max(item.seconds ?? 0, b.from + b.dur + 0.5),
    screenshots: [...new Set([b.from, b.from + b.dur - 1 / 30])],
  };
});
