import { PLAY, IN_OFFICE, CLEAR_CARDS, IDLE, CAMLOG, FOLLOW } from '../../scripts/capture-manifest.js';

const setup = PLAY({ weeks: 110, after: `${IN_OFFICE}
  const H = window.__HITL, R = window.__hitlRender;
  H.dispatch({ type: 'setPolicy', id: 'async_standups', on: false });
  H.dispatch({ type: 'setPolicy', id: 'daily_standups', on: true });
  s.flags.botStandup = 'daily_standups';
  window.__meetings = [];
  const handle = R.handleEvents.bind(R);
  R.handleEvents = (events, state) => {
    const before = R.stats.standup;
    handle(events, state);
    if (!before && R.stats.standup) {
      const event = events.find(e => e.type === 'standup');
      window.__meeting = { start: window.__capture.now / 1000 - window.__setupAt, week: state.week, lines: event.lines.map(l => ({ ...l, name: state.staff.find(p => p.id === l.staffId)?.name })), shown: [] };
      window.__meetings.push(window.__meeting);
    }
  };
  let week = -1, seenDecision = null, decisionAt = 0;
  setInterval(() => {
    ${CLEAR_CARDS}; ${IDLE};
    const d = s.pendingDecision;
    if (d && seenDecision !== d) { seenDecision = d; decisionAt = window.__capture.now; }
    if (d && window.__capture.now - decisionAt >= 3000) b.botDecide('balanced', s, { onEvents: H.emit });
    if (s.week !== week && !s.pendingDecision) { week = s.week; b.botTurn('balanced', s, { onEvents: H.emit }); }
  }, 500);
  let previous = '';
  const observe = () => {
    if (window.__meeting) {
      const m = window.__meeting;
      const bubbles = [...document.querySelectorAll('.hitl-say')];
      const signature = bubbles.map(el => el.textContent).join('|');
      for (const el of bubbles) {
        const text = el.textContent;
        if (signature !== previous) m.shown.push({ text, at: window.__capture.now / 1000 - window.__setupAt });
      }
      previous = signature;
      if (!R.stats.standup && !m.end) { m.end = window.__capture.now / 1000 - window.__setupAt; window.__meeting = null; }
    }
    requestAnimationFrame(observe);
  };
  requestAnimationFrame(observe);
` });
const target = `() => {
  const H = window.__HITL, R = window.__hitlRender;
  const m = window.__meeting;
  if (!m || R.spotlight()) return null;
  const goals = m.lines.map(l => R.walkOf(l.staffId)?.temp?.goal).filter(Boolean);
  if (!goals.length) return null;
  return { x: goals.reduce((v,p) => v+p.x,0)/goals.length, z: goals.reduce((v,p) => v+p.z,0)/goals.length };
}`;
export function item({ id = 'successive-standups-1x', speed = 1, seconds = 650, warmup = 1 } = {}) {
  return {
    id, title: `Standup conversations at ${speed}x`,
    query: 'seed=26&speed=0&time=day', seconds, warmup, fps: 30, size: '1280x800', hideUi: true,
    setup: `(async () => { await ${setup}; ${FOLLOW(target, 2.3, 0, seconds)[0].js}; window.__setupAt = window.__capture.now / 1000; window.__HITL.setSpeed(${speed}); })()`,
    actions: [...CAMLOG(seconds),
      { at: 0, js: `(window.__captureMarks ??= []).push({t:0,label:'origin '+(window.__capture.now / 1000 - window.__setupAt)})` },
      { at: seconds - 0.04, js: `(window.__captureMarks ??= []).push({ t: 0, label: 'meetings ' + JSON.stringify(window.__meetings) })` }],
    screenshots: [8, 14, 22],
  };
}
export const ITEMS = [item()];
