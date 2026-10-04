// Early-era clips for the owner's review: a founded dot-com or Web 2.0 company played live from a saved
// state, with `?eras` on so the period props, billboard and wardrobe show.
//
//   node scripts/reels/era-snaps.mjs            writes the saved states into shots/era-snaps
//   scripts/with-render-lock.sh --gpu node scripts/capture.js --manifest scripts/reels/era-manifest.js --out shots/era
import { CHOOSE_WHEN, CLEAR_CARDS } from '../capture-manifest.js';

// Side panels, top bar and tray hidden; the decision cards and the moment caption stay.
const BARE = `(() => { const st = document.createElement('style'); st.textContent = '#ui > * { visibility: hidden !important; } #ui .moment-cap, #ui .modal-back, #ui .modal-dock, #ui .announce-back, #ui .announce-back * { visibility: visible !important; }'; document.head.append(st); })()`;
const PEOPLE = { js: "(() => { let n = 0, x = 0, z = 0; window.__hitlRender.scene.traverse((o) => { if (o.userData.staffId !== undefined) { const v = o.parent.getWorldPosition(new o.parent.position.constructor()); x += v.x; z += v.z; n++; } }); return n ? { x: x / n, z: z / n } : null; })()" };
const PUSH = [{ at: 0, target: { prop: 'billboard' }, zoom: 1.2 }, { at: 4.5, target: PEOPLE, zoom: 1.8, ease: 'inOut' }, { at: 13.5, zoom: 2.2, ease: 'linear' }];

const SNAP_DIR = 'shots/era-snaps';
const LOAD = (name) => `(async () => {
  const res = await fetch('/${SNAP_DIR}/${name}.snap');
  if (!res.ok) throw new Error('era: no saved state ${name}');
  const state = JSON.parse(await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).text());
  const { saveGame } = await import('/src/save/save.js');
  if (!saveGame(state, localStorage)) throw new Error('era: could not save ${name}');
  const r = window.__HITL.controls.continueGame();
  if (!r.ok) throw new Error('era: the game refused ${name}: ' + (r.reason ?? ''));
  window.__HITL.setSpeed?.(1);
  ${BARE};
})()`;

const clip = (id, title, snap, extra = {}) => ({
  id, title, query: 'seed=1&speed=1&eras', seconds: 14, screenshots: [2, 6, 10, 13],
  setup: LOAD(snap),
  actions: [...Array.from({ length: 30 }, (_, i) => ({ at: i + 0.2, js: CLEAR_CARDS })), ...CHOOSE_WHEN(null, 0, 1, 30, 3)],
  ...extra,
});

export const ITEMS = [
  clip('era-preinternet', 'Pre-internet garage', 'preinternet-7-pre', { camera: PUSH }),
  clip('era-dotcom-boom', 'Dot-com boom', 'dotcom-7-boom', { camera: PUSH }),
  clip('era-y2k', 'Y2K rollover', 'dotcom-7-y2k', { seconds: 30, screenshots: [] }),
  clip('era-dotcom-bust', 'Dot-com bust', 'dotcom-7-bust', { camera: PUSH }),
  clip('era-web2', 'Web 2.0', 'dotcom-7-w2', { camera: PUSH }),
];

// One still per era, the same office and view, for the side-by-side sheet. Modern eras also set the
// simulated era so the interior dressing follows the billboard.
const ALL = ['preinternet', 'dotcom', 'dotcom-bust', 'web2', 'classic', 'chatgbt', 'agents', 'consolidation', 'plateau'];
const SET_ERA = (id) => `(() => { const s = window.__HITL.state; s.era = { id: '${id}', since: s.week }; })()`;
ITEMS.push(...ALL.map((era) => ({
  id: `era-still-${era}`, title: `Era still: ${era}`, query: `mock=garage&time=day&eras&eraArt=${era}`, still: true, hideUi: true, warmup: 1.5,
  setup: ['classic', 'chatgbt', 'agents', 'consolidation', 'plateau'].includes(era) ? SET_ERA(era) : undefined,
  screenshots: [2],
  // The camera frames the office and its billboard rather than the whole board.
  camera: [{ at: 0, target: { js: PEOPLE.js.replace('x: x / n, z: z / n', 'x: x / n - 0.9, z: z / n + 0.9') }, zoom: 1.25 }],
})));
