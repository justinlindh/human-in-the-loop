// Clips and screenshots for scripts/capture.js. Each item:
//   id, title, query (URL params: mock=<scenario> or seed=N, speed, ...), seconds, seed (for the
//   page's Math.random), warmup (seconds run before recording starts), hideUi, gif,
//   setup (page JS run once after boot), actions ([{ at: seconds, js }] run during the clip),
//   screenshots ([seconds] saved as PNG alongside the clip).
// Page JS has window.__HITL (state, dispatch, tickN, emit, controls) and window.__capture.

// The first person at a desk who is in the office.
const PICK = `(() => { const s = window.__HITL.state; return s.staff.find((p) => p.mood !== 'away' && !p.remote && p.assignment?.type !== 'sabbatical'); })()`;

export const ITEMS = [
  {
    id: 'waffle-party',
    title: 'Waffle Party (incentives)',
    query: 'mock=floor&speed=1',
    seconds: 15,
    warmup: 1.5,
    actions: [{ at: 0.5, js: `window.__HITL.emit([{ type: 'incentive', staffId: ${PICK}.id, reward: 'waffle_party' }])` }],
    screenshots: [7],
  },
];
