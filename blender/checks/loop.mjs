// Decision moments through the real game loop: a check that main.js's own frame loop, UI and decision
// handling (not the harness's direct stepping) let a staged moment play while its decision is open.
//
//   node blender/checks/loop.mjs [--moments 'first_user_test; open_plan_office --seed 3; hearing_summons --seed 1']
//                                [--seconds 30] [--gpu | --software]
//
// Each moment is an indexed decision (scripts/events). The page loads the state just before the tick
// that raised it (its preTick snapshot) through the title screen's Continue path
// (controls.continueGame), in a normal page: no ?snap, the full UI. The game's own loop then ticks
// into the decision, raising it and its card as in play. The page runs on virtual time: requestAnimationFrame, timers, performance.now and Date.now
// are driven from here one frame (1/30 s) at a time, and Math.random is seeded, so main.js's frame()
// runs as it does for a player, decision freeze included. Medium quality: at Low, moments are an
// emote by design. The check fails a moment when, over
// --seconds with its decision still open, nobody takes the moment or its actors do not move. The
// window is long enough for someone called from across the office (the letter's reader walking in
// from the door) and ends 2 s after an actor has moved, so a moment that starts at once costs no more. Pick
// decisions whose moment plays while the decision is open (the visitor, the hammer fetch, the
// letter); some moments play only once the choice is made.
//
// A query 'party:<decision>' picks the first indexed <decision> raised in the same week as a launch
// or award, whose company party poses everyone the moment could take just as the game freezes.
// Which week that is depends on the sim, so it is looked up in the index this run uses; with none,
// the case is skipped and says so.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { glMode, holdRenderLock, launchChromium } from '../../scripts/lib/gl.js';
import { resolveTarget, snapshotEntries } from '../../scripts/events/load.js';
import { simHash, indexDir, readIndex } from '../../scripts/events/lib.js';
import { join } from 'node:path';
import { fmtTrace, fmtActor, ACTOR_JS } from './diag.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const queries = opt('moments', 'first_user_test; open_plan_office --seed 3; hearing_summons --seed 1; party:hearing_summons').split(';').map((q) => q.trim()).filter(Boolean);
const seconds = Number(opt('seconds', 30));
const MOVE_M = 0.3;

import { SHIM } from './loop-clock.mjs';

const mode = glMode({ argv });
holdRenderLock(mode);
const server = await createServer({ server: { port: 0, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const { browser } = await launchChromium(chromium, { mode, label: 'loop' });
let failed = 0;
try {
  for (let query of queries) {
    if (query.startsWith('party:')) {
      const id = query.slice(6), rows = readIndex(simHash())?.rows ?? [];
      const key = (r) => `${r.seed}|${r.bot}|${r.week}`;
      const party = new Set(rows.filter((r) => r.type === 'launch' || r.type === 'award').map(key));
      const hit = rows.find((r) => r.type === 'decision' && r.id === id && r.preTick && party.has(key(r)));
      if (!hit) { console.log(`LOOP skip ${query}: no ${id} in a launch or award week in this index`); continue; }
      query = `${id} --seed ${hit.seed} --bot ${hit.bot} --weeks ${hit.week}-${hit.week}`;
    }
    // The state just before the tick that raises the decision, so the game's own tick raises it.
    let target;
    try { target = resolveTarget({ event: `${query} --pre` }); } catch (e) { failed++; console.log(`LOOP FAIL ${query}: ${e.message}`); continue; }
    const row = target.row;
    if (!row?.preTick) { failed++; console.log(`LOOP FAIL ${query}: no indexed moment with a pre-tick snapshot`); continue; }
    target.file = join(indexDir(simHash()), 'snapshots', row.preTick);
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(SHIM);
    await page.addInitScript((list) => { for (const [k, v] of list) localStorage.setItem(k, v); }, await snapshotEntries(target.file));
    await page.goto(`${base}?quality=medium`, { waitUntil: 'load' });
    // Loading (models, fonts) runs on real promises; frames keep the page's own timers moving.
    for (let i = 0; i < 1200; i++) {
      if (await page.evaluate(() => !!(window.__HITL && window.__hitlRender?.ready))) break;
      await page.evaluate(() => window.__frame(1));
      await new Promise((r) => setTimeout(r, 50));
    }
    const res = await page.evaluate(({ seconds, moveM }) => {
      const H = window.__HITL, R = window.__hitlRender;
      if (R.trace) R.trace.on = true;
      const loaded = H.controls.continueGame();
      if (!loaded.ok) return { error: `continueGame: ${JSON.stringify(loaded)}` };
      H.setSpeed?.(1);
      const S = () => H.state;
      const where = () => { const out = new Map(); R.scene.traverse((o) => { if (o.userData.staffId !== undefined) out.set(o.userData.staffId, o.parent.getWorldPosition(new o.parent.position.constructor())); }); return out; };
      // Play on until the game ticks into the decision (a week is a few seconds at speed 1).
      let waited = 0;
      for (; waited < 120 * 30 && !S().pendingDecision; waited++) window.__frame(1);
      const eventId = S().pendingDecision?.eventId ?? null;
      const actors = new Map();
      let frozen = 0, frames = 0;
      let movedAt = null;
      for (let f = 0; f < seconds * 30 && S().pendingDecision; f++) {
        if (movedAt !== null && f - movedAt >= 60) break;
        window.__frame(1);
        frames++;
        if (H.clock.frozen) frozen++;
        const at = where();
        for (const [id, what] of R.moments?.active ?? []) {
          const p = at.get(id);
          if (!p) continue;
          const a = actors.get(id) ?? { what, first: p.clone(), far: 0 };
          a.far = Math.max(a.far, a.first.distanceTo(p));
          actors.set(id, a);
          if (a.far >= moveM && movedAt === null) movedAt = f;
        }
      }
      return { eventId, subject: S().pendingDecision?.subjectId ?? S().pendingDecision?.stage?.staffId ?? null, trace: R.trace?.lines(20) ?? [], waited: +(waited / 30).toFixed(1), open: !!S().pendingDecision, frames, frozen, actors: [...actors].map(([id, a]) => ({ id, moment: a.what, moved: +a.far.toFixed(2) })) };
    }, { seconds, moveM: MOVE_M });
    const label = `${row?.id ?? query} (seed ${row?.seed} ${row?.bot} week ${row?.week})`;
    if (res.error) { failed++; console.log(`LOOP FAIL ${label}: ${res.error}`); }
    else {
      const moved = res.actors.filter((a) => a.moved >= MOVE_M);
      const pass = res.eventId && res.actors.length > 0 && moved.length > 0;
      if (!pass) failed++;
      if (!pass) {
        // Who should have taken it, and the last of the ownership trace.
        const ids = [...new Set([res.subject, ...res.actors.map((a) => a.id)].filter((x) => x != null))];
        const detail = ids.length ? await page.evaluate(`(${ACTOR_JS})(${JSON.stringify(ids)})`) : [];
        res.detail = [...detail.map((a) => `  actor ${fmtActor(a)}`), ...res.trace.map((l) => `  trace ${fmtTrace(l)}`)];
      }
      console.log(`LOOP ${pass ? 'ok  ' : 'FAIL'} ${label}: decision ${res.eventId ?? 'none'} raised after ${res.waited} s, open ${res.frames} frames (${res.frozen} with the game frozen); ${res.actors.length ? res.actors.map((a) => `${a.id} ${a.moment} moved ${a.moved} m`).join(', ') : 'nobody took the moment'}`);
      for (const l of res.detail ?? []) console.log(l);
    }
    if (errors.length) { failed++; console.log(`page errors: ${errors.slice(0, 3).join('; ')}`); }
    await page.close();
  }
  // Spotlight hold (main.js): while the renderer reports a spotlight moment, no week passes but the
  // office keeps rendering; once it ends the weeks resume, and one held past main.js's cap is let go.
  // The renderer's spotlight() is stood in for here, so the hold is checked on its own.
  if (!argv.includes('--no-spotlight')) {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
    const errors = [];
    const warnings = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
    await page.addInitScript(SHIM);
    await page.goto(`${base}?seed=1&quality=low`, { waitUntil: 'load' });
    for (let i = 0; i < 1200; i++) {
      if (await page.evaluate(() => !!(window.__HITL?.playing && window.__hitlRender?.ready))) break;
      await page.evaluate(() => window.__frame(1));
      await new Promise((r) => setTimeout(r, 50));
    }
    const r = await page.evaluate(() => {
      const H = window.__HITL, R = window.__hitlRender, S = () => H.state;
      H.setSpeed?.(1);
      const clear = () => { for (let i = 0; i < 40 && S().pendingDecision; i++) { H.dispatch({ type: 'resolveDecision', choice: 0 }); window.__frame(1); } };
      // Frames per week at speed 1, measured on this page.
      clear();
      const w0 = S().week;
      let f = 0;
      while (S().week === w0 && f < 30 * 60) { window.__frame(1); clear(); f++; }
      const perWeek = f;
      const span = Math.max(3 * perWeek, 90);
      const run = (n) => {
        const w = S().week, fr = H.clock.frames;
        let spot = 0, frozen = 0;
        for (let i = 0; i < n; i++) { window.__frame(1); if (H.clock.spotlight) spot++; if (H.clock.frozen) frozen++; }
        return { weeks: S().week - w, frames: H.clock.frames - fr, spot, frozen };
      };
      const had = Object.getOwnPropertyDescriptor(R, 'spotlight');
      R.spotlight = () => ({ kind: 'check', key: 'hold-1', since: 0 });
      const held = run(span);
      R.spotlight = () => null;
      clear();
      const after = run(span);
      // A spotlight under an open card for longer than the cap: the time the card holds the clock
      // doesn't count, so once the card resolves the spotlight still holds it.
      let seek = 0;
      while (!S().pendingDecision && seek < 60 * perWeek) { window.__frame(1); seek++; }
      const card = { found: !!S().pendingDecision, event: S().pendingDecision?.eventId ?? null };
      if (card.found) {
        R.spotlight = () => ({ kind: 'check', key: 'card-1', since: 0 });
        for (let i = 0; i < 62 * 30 && S().pendingDecision; i++) window.__frame(1);
        card.stillOpen = !!S().pendingDecision;
        H.dispatch({ type: 'resolveDecision', choice: 0 });
        card.afterCard = run(span);
        R.spotlight = () => null;
        clear();
      }
      // A spotlight that never ends: let go after the cap, then the weeks move again.
      R.spotlight = () => ({ kind: 'check', key: 'stuck-1', since: 0 });
      const stuck = run(62 * 30 + span);
      // A long spotlight (a music night) that says how long it plays: held past the 60 s default,
      // and let go only after its own length with slack (90 s expected: about 122 s).
      // Cards answered first: time under a card never counts toward the cap.
      R.spotlight = () => null;
      clear();
      R.spotlight = () => ({ kind: 'check', key: 'long-1', since: 0, expectedSeconds: 90 });
      const longHeld = run(100 * 30);
      const longGone = run(30 * 30 + span);
      // A wrong expectedSeconds (milliseconds by mistake) is clamped to the ceiling, with a warning.
      R.spotlight = () => null;
      clear();
      R.spotlight = () => ({ kind: 'check', key: 'ms-1', since: 0, expectedSeconds: 90000 });
      const msHeld = run(170 * 30);
      const msGone = run(20 * 30 + span);
      if (had) Object.defineProperty(R, 'spotlight', had); else delete R.spotlight;
      return { perWeek, span, held, after, card, stuck, longHeld, longGone, msHeld, msGone };
    });
    const warned = warnings.some((w) => /spotlight .*stuck-1 held the clock/.test(w));
    const longWarn = warnings.find((w) => /spotlight .*long-1 held the clock/.test(w)) ?? '';
    const msClamp = warnings.some((w) => /spotlight .*ms-1 expects 90000s; holding the clock 180s at most/.test(w));
    const msLet = warnings.some((w) => /spotlight .*ms-1 held the clock over 180s/.test(w));
    const cardWarned = warnings.some((w) => /spotlight .*card-1 held the clock/.test(w));
    const c = r.card;
    const checks = [
      [r.held.weeks === 0, `no week passed in ${r.held.frames} frames of a spotlight (${(r.span / r.perWeek).toFixed(1)} weeks' worth)`],
      [r.held.frames === r.span && r.held.frozen === 0, `the office kept rendering, unfrozen (${r.held.frozen} frozen frames)`],
      [r.held.spot === r.span, `clock.spotlight reported it on every frame (${r.held.spot} of ${r.span})`],
      [r.after.weeks >= 2, `the weeks resumed after it ended (${r.after.weeks} in the same span)`],
      [c.found && c.stillOpen && !cardWarned && c.afterCard?.weeks === 0 && c.afterCard?.spot === r.span,
        c.found ? `a spotlight under the ${c.event} card for 62 s still held the clock after the card resolved (${c.afterCard?.weeks} weeks, spotlight on ${c.afterCard?.spot} of ${r.span} frames${cardWarned ? ', but it was let go' : ''})` : 'no decision card came up to hold a spotlight under'],
      [r.longHeld.weeks === 0 && r.longHeld.spot === r.longHeld.frames && r.longGone.weeks >= 1 && /over 122\.5s/.test(longWarn),
        `a spotlight expecting 90 s held for 100 s with no week passing (${r.longHeld.weeks}), then was let go at its own cap (${longWarn ? longWarn.replace(/^.*held the clock /, '') : 'no warning'}; ${r.longGone.weeks} weeks after)`],
      [msClamp && r.msHeld.weeks === 0 && msLet && r.msGone.weeks >= 1,
        `a spotlight expecting 90000 s was clamped to 180 s (warning ${msClamp ? 'logged' : 'missing'}), held 170 s (${r.msHeld.weeks} weeks) and let go at 180 s (${msLet ? 'logged' : 'not let go'}; ${r.msGone.weeks} weeks after)`],
      [r.stuck.weeks >= 1 && warned, `one held past the cap was let go (${r.stuck.weeks} weeks after, warning ${warned ? 'logged' : 'missing'})`],
    ];
    const pass = checks.every(([ok]) => ok) && !errors.length;
    if (!pass) failed++;
    console.log(`LOOP ${pass ? 'ok  ' : 'FAIL'} spotlight hold: ${checks.map(([ok, text]) => `${ok ? '' : 'NOT: '}${text}`).join('; ')}`);
    if (errors.length) console.log(`page errors: ${errors.slice(0, 3).join('; ')}`);
    await page.close();
  }
  // A real spotlight: the printer taken out back, through the real game loop. The week before
  // printer_jam is loaded, the card is answered with the choice that stages the smash, and from the
  // spotlight's start to its end no week may pass; the weeks resume after, and no hold is cut short.
  if (!argv.includes('--no-spotlight')) {
    let target = null, why = '';
    try {
      target = resolveTarget({ event: 'printer_jam --stage floor --choice 0 --pre' });
      if (!target.row?.preTick) { why = 'no printer_jam on the floor with a pre-tick snapshot'; target = null; }
      else target.file = join(indexDir(simHash()), 'snapshots', target.row.preTick);
    } catch (e) { why = e.message; }
    if (!target) { failed++; console.log(`LOOP FAIL real spotlight (printer_jam): ${why}`); }
    else {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
      const errors = [], warnings = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
      await page.addInitScript(SHIM);
      await page.addInitScript((list) => { for (const [k, v] of list) localStorage.setItem(k, v); }, await snapshotEntries(target.file));
      await page.goto(`${base}?quality=medium`, { waitUntil: 'load' });
      for (let i = 0; i < 1200; i++) {
        if (await page.evaluate(() => !!(window.__HITL && window.__hitlRender?.ready))) break;
        await page.evaluate(() => window.__frame(1));
        await new Promise((r) => setTimeout(r, 50));
      }
      const r = await page.evaluate(() => {
        const H = window.__HITL, R = window.__hitlRender, S = () => H.state;
        const loaded = H.controls.continueGame();
        if (!loaded.ok) return { error: `continueGame: ${JSON.stringify(loaded)}` };
        H.setSpeed?.(1);
        let f = 0;
        for (; f < 120 * 30 && S().pendingDecision?.eventId !== 'printer_jam'; f++) window.__frame(1);
        if (S().pendingDecision?.eventId !== 'printer_jam') return { error: 'printer_jam never came up' };
        H.dispatch({ type: 'resolveDecision', choice: 0 });
        // Frame by frame: is a spotlight up, and what week is it.
        const on = [], weeks = [];
        for (let i = 0; i < 90 * 30; i++) {
          window.__frame(1);
          const sp = R.spotlight?.();
          on.push(sp ? sp.kind : null); weeks.push(S().week);
          if (S().pendingDecision) H.dispatch({ type: 'resolveDecision', choice: 0 });
        }
        const start = on.findIndex((k) => k === 'printer_jam');
        const end = start < 0 ? -1 : on.indexOf(null, start);
        return { start, end, weekAtStart: weeks[start], weekAtEnd: end > 0 ? weeks[end - 1] : null, weekLast: weeks[weeks.length - 1], seedWeek: S().week, kinds: [...new Set(on.filter(Boolean))] };
      });
      const cut = warnings.filter((w) => /spotlight .* held the clock/.test(w));
      const checks = r.error ? [[false, r.error]] : [
        [r.start >= 0, r.start >= 0 ? `the printer spotlight started ${(r.start / 30).toFixed(1)} s after the choice` : `no printer_jam spotlight came up (seen: ${r.kinds.join(', ') || 'none'})`],
        [r.start >= 0 && r.end > r.start, r.end > r.start ? `it ended by itself after ${((r.end - r.start) / 30).toFixed(1)} s` : 'it never ended in 90 s'],
        [r.end > r.start && r.weekAtStart === r.weekAtEnd, `no week passed while it played (week ${r.weekAtStart} to ${r.weekAtEnd})`],
        [r.end > r.start && r.weekLast > r.weekAtEnd, `the weeks resumed after it (week ${r.weekLast} by the end of the watch)`],
        [cut.length === 0, cut.length ? `the hold was cut short: ${cut[0]}` : 'the hold was never cut short'],
      ];
      const pass = checks.every(([ok]) => ok) && !errors.length;
      if (!pass) failed++;
      console.log(`LOOP ${pass ? 'ok  ' : 'FAIL'} real spotlight (printer_jam, seed ${target.row.seed} week ${target.row.week}): ${checks.map(([ok, text]) => `${ok ? '' : 'NOT: '}${text}`).join('; ')}`);
      if (errors.length) console.log(`page errors: ${errors.slice(0, 3).join('; ')}`);
      await page.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
const total = queries.length + (argv.includes('--no-spotlight') ? 0 : 2);
console.log(`loop: ${total - failed} of ${total} checks passed through the game loop`);
process.exit(failed ? 1 : 0);
