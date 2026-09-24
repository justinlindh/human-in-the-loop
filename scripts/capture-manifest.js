// Clips and screenshots for scripts/capture.js. Each item:
//   id, title, query (URL params: mock=<scenario> or seed=N, speed, ...), seconds, seed (for the
//   page's Math.random), warmup (seconds run before recording starts), hideUi, gif,
//   setup (page JS run once after boot), actions ([{ at: seconds, js }] run during the clip),
//   screenshots ([seconds] saved as PNG alongside the clip).
// Page JS has window.__HITL (state, dispatch, tickN, emit, controls) and window.__capture.

// Clicks the visible button with this label (a player dismissing a card).
const CLICK = (label) => `[...document.querySelectorAll('button')].find((b) => b.offsetParent && b.textContent.trim() === ${JSON.stringify(label)})?.click()`;

// The first person at a desk who is in the office.
const PICK = `(() => { const s = window.__HITL.state; return s.staff.find((p) => p.mood !== 'away' && !p.remote && p.assignment?.type !== 'sabbatical'); })()`;

export const ITEMS = [
  {
    id: 'waffle-party',
    title: 'Waffle Party (incentives)',
    query: 'mock=floor&speed=1',
    seconds: 19,
    warmup: 1.5,
    // The incentive card pauses the game while it is open; the party plays once it is dismissed.
    actions: [
      { at: 0.5, js: `window.__HITL.emit([{ type: 'incentive', staffId: ${PICK}.id, reward: 'waffle_party' }])` },
      { at: 3.0, js: CLICK('Onward') },
    ],
    screenshots: [1.5, 10],
  },
];
