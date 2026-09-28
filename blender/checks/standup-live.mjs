#!/usr/bin/env node
// Exercise generated conversations while the real game loop continues ticking during their turns.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLAY, IN_OFFICE, CLEAR_CARDS, IDLE } from '../../scripts/capture-manifest.js';

const after = IN_OFFICE + `s.policies.daily_standups=false;s.policies.async_standups=false;s.projects=[];s.pendingDecision=null;s.chatPrompts=[];
  for(const p of s.staff){p.mood='ok';p.assignment={type:'idle',targetId:null};}`;

async function startConversation({ speed, path }) {
  const H = window.__HITL, S = H.state;
  const { standupSystem } = await import('/src/sim/standup.js');
  const { makeCtx } = await import('/src/sim/registry.js');
  if (path === 'outage' || path === 'replacement') {
    S.outage = { productId: S.products.find(p => !p.killed).id, kind: 'bug', severity: path === 'outage' ? 0.01 : 100, weeks: 0, unrecoverable: false };
  } else {
    S.flags.standupConversationRecent = [];
    for (const p of S.staff.slice(2)) {
      if (path === 'remote') p.remote = true;
      else if (path === 'sabbatical') { p.mood = 'away'; p.sabbaticalWeeksLeft = 30; p.assignment = { type: 'sabbatical', targetId: null }; }
      else p.mood = path;
    }
  }
  S.policies.daily_standups = true;
  // Only some daily standups hold a conversation; this check needs one, so it forces the roll for this meeting.
  const { B } = await import('/src/sim/balance.js');
  const chance = B.standupConversationChance;
  B.standupConversationChance = 1;
  const ctx = makeCtx(S);
  try { standupSystem(ctx); } finally { B.standupConversationChance = chance; S.policies.daily_standups = false; }
  window.__standupScript = S.flags.standupConversation?.script ?? null;
  const event = ctx.events.find(e => e.type === 'standup');
  window.__standupCheck = { path, speed, lines: event.lines, frames: [], startedWeek: S.week };
  H.setSpeed(speed); H.emit([event]);
  const record = () => {
    const check = window.__standupCheck;
    check.frames.push({ week: S.week, outage: !!S.outage, replaced: !!check.replaced,
      text: [...document.querySelectorAll('.hitl-say')].map(e => e.textContent), meeting: window.__hitlRender.stats.standup });
    requestAnimationFrame(record);
  };
  requestAnimationFrame(record);
}

async function assertConversation() {
  const c = window.__standupCheck;
  const { holdSeconds } = await import('/src/render/reading.js');
  if (!c || !c.frames.some(f => f.meeting) || c.frames.at(-1).meeting || c.frames.at(-1).week <= c.startedWeek) throw Error('standup-live: meeting or real clock did not complete');
  if (c.frames.some(f => f.meeting && f.text.length > 1)) throw Error('standup-live: overlapping bubbles');
  const changed = c.path === 'outage' || c.path === 'replacement';
  const expected = changed ? ['The incident changed. Let us check the latest update.', 'What do we need to carry forward?', 'The facts, the next step, and who is checking it.'] : c.lines.slice(0, 5).map(l => l.text);
  const { STANDUP_EXCHANGES } = await import('/src/data/standup.js');
  const script = STANDUP_EXCHANGES.find(e => e.id === window.__standupScript);
  if (!changed && !script) throw Error('standup-live: no conversation was picked');
  if (!changed && expected[2] !== script.lines[2]) throw Error('standup-live: two speakers lost the answer');
  for (const text of expected) {
    const dwell = c.frames.filter(f => f.text.includes(text)).length / 30;
    if (dwell < holdSeconds(text, c.speed) - 0.05) throw Error('standup-live: missing or shortened turn: ' + text);
  }
  const shown = [];
  for (const f of c.frames) for (const text of f.text) if (expected.includes(text) && shown.at(-1) !== text) shown.push(text);
  if (JSON.stringify(shown) !== JSON.stringify(expected)) throw Error('standup-live: turn order changed');
  if (changed) {
    const first = c.frames.findIndex(f => c.path === 'outage' ? !f.outage : f.replaced);
    if (first < 0) throw Error('standup-live: live premise never changed');
    // Permit the observing callback's one-frame lead over the renderer on the transition itself.
    if (c.frames.slice(first + 1).some(f => f.text.some(text => c.lines.some(l => l.text === text)))) throw Error('standup-live: stale conversation survived its premise');
  }
  (window.__captureMarks ??= []).push({ label: 'standup-live-pass', path: c.path, speed: c.speed, expected, shown });
}

export const ITEMS = [
  ...[1, 2, 4].map(speed => ({ path: 'outage', speed })),
  { path: 'replacement', speed: 4 },
  ...['remote', 'sabbatical', 'burnout', 'coasting'].map(path => ({ path, speed: 1 })),
].map(options => ({
  id: `standup-live-${options.path}-${options.speed}`, title: 'Standup live premise and complete exchange',
  query: 'seed=26&speed=0&time=day', warmup: 0, still: true, fps: 30, size: '1280x800', screenshots: [45],
  setup: `(async()=>{await ${PLAY({ weeks: 110, after })};setInterval(()=>{${CLEAR_CARDS};${IDLE};if(window.__HITL.state.pendingDecision)window.__HITL.dispatch({type:'resolveDecision',choice:0});},100);window.__HITL.setSpeed(1);})()`,
  actions: [
    { at: 4, js: `(${startConversation.toString()})(${JSON.stringify(options)})` },
    ...(options.path === 'replacement' ? [{ at: 6, js: "window.__HITL.state.outage={...window.__HITL.state.outage,weeks:0,kind:'replacement'};window.__standupCheck.replaced=true;" }] : []),
    { at: 44.9, js: `(${assertConversation.toString()})()` },
  ],
}));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = spawnSync('timeout', ['480', 'nice', '-n', '10', 'node', 'scripts/capture.js', '--manifest', fileURLToPath(import.meta.url), '--out', 'shots/standup-live', '--no-webm', ...process.argv.filter(a => a === '--gpu' || a === '--software')], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
}
