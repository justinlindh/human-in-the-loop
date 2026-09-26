// Predicates run in the capture page at the cut, against the live sim, renderer and visible UI.
const EXPECT = {
  garage: "s.office.stage === 0 && s.staff.length === 2",
  office: "s.office.stage === 1",
  build: "visible('.buildbar', 'Foosball') && window.__glide",
  hire: "visible('.cand button:not(:disabled)', 'Hire') && s.candidates.length > 0",
  launch: "s.office.stage === 1 && visible('.modal.launch', 'Review average') && s.products.some(p => p.version === 1 && p.score >= 9 && visible('.modal.launch', p.name + ' launched!'))",
  incident: "s.outage && s.staff.some(p => R.probe(p.id)?.anim === 'run')",
  yak: "visible('.chat.yak .msg', 'me in standup') && visible('.chat.yak .msg', 'prod is back')",
  'yak-react': "s.staff.some(p => R.probe(p.id)?.anim?.startsWith('facepalm'))",
  printer: "R.moments.printer && Math.abs(R.moments.printer.cue - 9.9) <= 1 / 30 && R.props.current().some(p => p.prop === 'printer_wrecked') && R.flying",
  'era-chatgbt': "s.era.id === 'chatgbt'",
  'era-agents': "s.era.id === 'agents'",
  'cloud-bill': "s.pendingDecision?.eventId === 'agent_runaway_spend' && s.pendingDecision.stage?.prop === 'rack_hot' && R.props.current().some(p => p.prop === 'rack_hot') && visible('.modal.decision', 'The cloud bill has feelings')",
  'era-consolidation': "s.era.id === 'consolidation' && s.office.stage === 2",
  waffle: "R.incentives?.party && R.flying",
  dance: "R.incentives?.dance?.dancers?.length > 0",
  plateau: "s.era.id === 'plateau' && s.office.stage === 2 && s.staff.length > 0 && s.staff.length < s.office.placed.filter(p => p.itemId === 'desk').length",
};

function check(id, at, predicate) {
  return { at, js: `(() => {
    const s = window.__HITL.state, R = window.__hitlRender;
    const visible = (selector, text = '') => [...document.querySelectorAll(selector)].some(el => {
      if (!el.textContent.includes(text)) return false;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return false;
      for (let p = el; p; p = p.parentElement) {
        const style = getComputedStyle(p);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      }
      return true;
    });
    const ok = !s.gameOver && (${predicate});
    (window.__captureMarks ??= []).push({ t: ${at}, label: 'beat-check', beat: ${JSON.stringify(id)}, ok, week: s.week, era: s.era.id, staff: s.staff.length, event: s.pendingDecision?.eventId ?? null, printerCue: R.moments?.printer?.cue ?? null, printerHits: R.moments?.printer?.hit ?? null });
    if (!ok) console.error('trailer: ${id} missing its subject in a live office at ${at}s');
  })()` };
}

export function beatAssertions(beat) {
  const predicate = EXPECT[beat.id];
  if (!predicate) throw new Error(`trailer: no cut assertion for ${beat.id}`);
  const checks = [check(beat.id, beat.from, predicate)];
  // The build and hire beats must complete the action after opening on its controls.
  if (beat.id === 'build') checks.push(check(beat.id, 3, "s.office.placed.some(p => p.itemId === 'foosball')"));
  if (beat.id === 'printer') checks.push(check(beat.id, beat.from + 2, 'R.moments.printer?.hit >= 2 && R.flying'));
  if (beat.id === 'hire') {
    checks.unshift({ at: 0, js: 'window.__staffBeforeHire = window.__HITL.state.staff.length' });
    checks.push(check(beat.id, 2.2, 's.staff.length === window.__staffBeforeHire + 1'));
  }
  return checks;
}
