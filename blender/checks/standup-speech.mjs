// Runs in the harness page so assertions observe the actual bubble lifetime and turn order.
export async function checkStandupSpeech(R, S, { speed = 1, path = 'normal' } = {}) {
  const { holdSeconds } = await import('/src/render/reading.js');
  // The ambient case opens the bubble cap and gaps, so only the standup's quiet ring can hold a line.
  const { SPEECH } = await import('/src/render/speech-budget.js');
  const budget = { ...SPEECH };
  if (path === 'ambient') Object.assign(SPEECH, { max: 3, gap: 0, personGap: 0 });
  try {
    return await run();
  } finally {
    Object.assign(SPEECH, budget);
  }
  async function run() {
  S.pendingDecision = null;
  S.chatPrompts = [];
  S.office.props = [];
  S.workPolicy = 'office'; S.lockdown = null;
  for (const p of S.staff) { p.mood = 'ok'; p.remote = false; p.call = null; }
  R.perks.hold = true;
  R.setSpeed(speed); R.setPaused(false);
  window.__settle(180);
  const ids = S.staff.slice(0, 3).map(p => p.id);
  const lines = [
    { staffId: ids[0], text: 'What needs another pair of eyes?' },
    { staffId: ids[1], text: 'The plan. I have three answers to one question.' },
    { staffId: ids[2], text: 'Let us try the smallest answer first.' },
    { staffId: ids[1], text: 'Good. I will bring one question back.' },
  ];
  if (path === 'denied') {
    R.handleEvents([{ id: 'standup-blocker', type: 'say', staffId: S.staff[3].id, text: 'Please hold that thought while I check something.', moment: 'printer_jam' }], S);
    for (let i = 0; i < 90 && !document.querySelector('.hitl-say'); i++) window.__settle(1);
    if (!document.querySelector('.hitl-say')) throw Error('priority blocker did not appear');
  }
  R.handleEvents([{ type: 'standup', mode: 'daily', lines }], S);
  const posOf = (id) => { let o = null; R.scene.traverse((x) => { if (!o && x.userData.staffId === id) o = x.parent; }); if (!o) return null; const v = o.getWorldPosition(new o.position.constructor()); return { x: v.x, z: v.z }; };
  const shown = [], dwell = new Map();
  let blocked = false, paused = false, changed = false, departed = false, pauseStable = true, max = 0;
  let nearId = null, farId = null, farShown = false, staged4x = false, quiet = 0;
  for (let frame = 0; frame < 1800; frame++) {
    if (path === 'priority' && shown.length === 1 && !blocked) {
      R.handleEvents([{ type: 'launch' }], S);
      if (!R.spotlight()) throw Error('priority scene did not start');
      blocked = true;
    }
    // Between the first and second turns, when no bubble is up: only the quiet ring can hold a line.
    quiet = document.querySelector('.hitl-say') ? 0 : quiet + 1;
    if (path === 'ambient' && shown.length === 1 && !blocked && quiet >= 4) {
      // The nearest and farthest non-attendees from the ring: the near one is held, the far one talks.
      // Where each person stands now, as the renderer's quiet ring measures it.
      const st = R.stats.standup, dist = (p) => { const at = posOf(p.id); return at ? Math.hypot(at.x - st.at.x, at.z - st.at.z) : Infinity; };
      const others = S.staff.filter(p => !ids.includes(p.id) && R.walkOf(p.id) && !R.walkOf(p.id).hidden).sort((a, b) => dist(a) - dist(b));
      nearId = others[0]?.id; farId = others.at(-1)?.id;
      // Nobody may stand that close in the mock, so the near speaker is placed just inside the quiet ring.
      if (nearId && dist(others[0]) >= st.quietR) R.standAt(nearId, st.at.x + st.quietR - 0.4, st.at.z);
      if (!nearId || nearId === farId || dist(others.at(-1)) < st.quietR) throw Error('ambient: need one speaker inside and one outside the quiet ring ' + JSON.stringify({ quietR: st.quietR, at: st.at, d: others.map(p => [p.id, +dist(p).toFixed(2)]) }));
      R.handleEvents([
        { id: 'ambient-one', type: 'say', staffId: nearId, text: 'Unrelated chatter near.' },
        { id: 'ambient-two', type: 'say', staffId: nearId, text: 'Unrelated celebration near.', moment: 'launch' },
        { id: 'ambient-far', type: 'say', staffId: farId, text: 'Unrelated chatter far.' },
      ], S);
      blocked = true;
    }
    if (['pause', 'menu'].includes(path) && shown.length === 1 && !paused) {
      if (path === 'pause') R.setSpeed(0); else R.setPaused(true);
      const before = JSON.stringify(R.stats.standup);
      const bubble = document.querySelector('.hitl-say')?.textContent;
      window.__settle(150);
      pauseStable = before === JSON.stringify(R.stats.standup) && bubble === document.querySelector('.hitl-say')?.textContent;
      R.setSpeed(speed); R.setPaused(false); paused = true;
    }
    if (path === 'speed' && shown.length === 1 && !changed) { R.setSpeed(4); changed = true; }
    if (path === 'departure' && shown.length === 1 && !departed) {
      S.staff = S.staff.filter(p => p.id !== ids[1]); departed = true;
    }
    if (['away', 'empty'].includes(path) && shown.length === 1 && !departed) {
      for (const p of S.staff) if (path === 'empty' || p.id === ids[1]) p.mood = 'away';
      departed = true;
    }
    window.__settle(1);
    if (speed >= 4 && R.stats.standup) staged4x = true;
    if (path === 'denied' && R.stats.standup?.phase === 'talk' && document.querySelector('.hitl-say')?.textContent.startsWith('Please hold')) {
      if (R.stats.standup.i !== 0) throw Error('denied turn advanced');
      blocked = true;
    }
    const bubbles = [...document.querySelectorAll('.hitl-say')].filter(el => el.isConnected);
    max = Math.max(max, (path === 'ambient' ? bubbles.filter(el => lines.some(l => el.textContent.includes(l.text))) : bubbles).length);
    for (const el of bubbles) {
      const text = el.textContent;
      if (path === 'ambient' && R.stats.standup && text.startsWith('Unrelated') && text.endsWith('near.')) throw Error('speech near the ring interrupted the meeting');
      if (path === 'ambient' && text.includes('Unrelated chatter far.')) farShown = true;
      if (!lines.some(l => l.text === text)) continue;
      if (!shown.includes(text)) shown.push(text);
      dwell.set(text, (dwell.get(text) ?? 0) + 1 / 30);
    }
    if (!R.stats.standup) break;
  }
  // A held line waits, it isn't dropped: the near speaker's celebration shows once the meeting ends.
  let heldShown = false, cleared = true;
  for (let frame = 0; frame < 300 && path === 'ambient' && !heldShown; frame++) {
    window.__settle(1);
    heldShown = [...document.querySelectorAll('.hitl-say')].some(el => el.textContent.includes('Unrelated celebration near.'));
  }
  // Reaching 4x mid-meeting clears the meeting's bubble along with the meeting.
  if (path === 'speed') { window.__settle(2); cleared = ![...document.querySelectorAll('.hitl-say')].some(el => lines.some(l => el.textContent.includes(l.text))); }
  // At 4x no standup is staged; reaching 4x mid-meeting ends it after the line on screen.
  const expected = speed >= 4 ? [] : (['empty', 'speed'].includes(path) ? lines.slice(0, 1) : lines.filter(l => !['departure', 'away'].includes(path) || l.staffId !== ids[1])).map(l => l.text);
  const readable = ['empty', 'speed'].includes(path) || shown.every(text => dwell.get(text) >= holdSeconds(text, speed) - 0.05);
  return { pass: JSON.stringify(shown) === JSON.stringify(expected) && !R.stats.standup && max <= 1 && readable && pauseStable && !staged4x && (path !== 'denied' || blocked) && (path !== 'ambient' || (farShown && heldShown)) && cleared,
    speed, path, expected, shown, dwell: Object.fromEntries(dwell), max, readable, pauseStable, staged4x, farShown, heldShown, cleared, completed: !R.stats.standup };
}
}
