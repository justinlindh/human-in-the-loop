// Runs in the harness page so assertions observe the actual bubble lifetime and turn order.
export async function checkStandupSpeech(R, S, { speed = 1, path = 'normal' } = {}) {
  const { holdSeconds } = await import('/src/render/reading.js');
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
  const shown = [], dwell = new Map();
  let blocked = false, paused = false, changed = false, departed = false, pauseStable = true, max = 0;
  for (let frame = 0; frame < 1800; frame++) {
    if (path === 'priority' && shown.length === 1 && !blocked) {
      // A short decision scene (the letter), started directly: it holds the room for about 3 s.
      let held = 0;
      R.spotlights.begin('letter', null, 6, () => ({ x: 0, z: 0 }), () => ++held < 90);
      if (!R.spotlight()) throw Error('priority scene did not start');
      blocked = true;
    }
    if (path === 'ambient' && shown.length === 1 && !blocked) {
      R.handleEvents([
        { id: 'ambient-one', type: 'say', staffId: S.staff[3].id, text: 'Unrelated chatter.' },
        { id: 'ambient-two', type: 'say', staffId: S.staff[3].id, text: 'Unrelated celebration.', moment: 'launch' },
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
    if (path === 'denied' && R.stats.standup?.phase === 'talk' && document.querySelector('.hitl-say')?.textContent.startsWith('Please hold')) {
      if (R.stats.standup.i !== 0) throw Error('denied turn advanced');
      blocked = true;
    }
    const bubbles = [...document.querySelectorAll('.hitl-say')].filter(el => el.isConnected);
    max = Math.max(max, bubbles.length);
    for (const el of bubbles) {
      const text = el.textContent;
      if (path === 'ambient' && R.stats.standup && text.startsWith('Unrelated')) throw Error('unrelated speech interrupted the meeting');
      if (!lines.some(l => l.text === text)) continue;
      if (!shown.includes(text)) shown.push(text);
      dwell.set(text, (dwell.get(text) ?? 0) + 1 / 30);
    }
    if (!R.stats.standup) break;
  }
  const expected = (path === 'empty' ? lines.slice(0, 1) : lines.filter(l => !['departure', 'away'].includes(path) || l.staffId !== ids[1])).map(l => l.text);
  const readable = path === 'empty' || shown.every(text => dwell.get(text) >= holdSeconds(text, path === 'speed' ? 4 : speed) - 0.05);
  return { pass: JSON.stringify(shown) === JSON.stringify(expected) && !R.stats.standup && max <= 1 && readable && pauseStable && (path !== 'denied' || blocked),
    speed, path, expected, shown, dwell: Object.fromEntries(dwell), max, readable, pauseStable, completed: !R.stats.standup };
}
