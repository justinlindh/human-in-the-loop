// Decision moments through the real game loop: a check that main.js's own frame loop, UI and decision
// handling (not the harness's direct stepping) let a staged moment play while its decision is open.
//
//   node blender/checks/loop.mjs [--moments 'first_user_test; open_plan_office --seed 3']
//                                [--seconds 10] [--gpu | --software]
//
// Each moment is an indexed decision (scripts/events). The page loads the state just before the tick
// that raised it (its preTick snapshot) through the title screen's Continue path
// (controls.continueGame), in a normal page: no ?snap, the full UI. The game's own loop then ticks
// into the decision, raising it and its card as in play. The page runs on virtual time: requestAnimationFrame, timers, performance.now and Date.now
// are driven from here one frame (1/30 s) at a time, and Math.random is seeded, so main.js's frame()
// runs as it does for a player, decision freeze included. Medium quality: at Low, moments are an
// emote by design. The check fails a moment when, over
// --seconds with its decision still open, nobody takes the moment or its actors do not move. Pick
// decisions whose moment plays while the decision is open (the visitor, the hammer fetch, the
// letter); some moments play only once the choice is made.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { glMode, holdRenderLock, launchChromium } from '../../scripts/lib/gl.js';
import { resolveTarget, snapshotEntries } from '../../scripts/events/load.js';
import { simHash, indexDir } from '../../scripts/events/lib.js';
import { join } from 'node:path';
import { fmtTrace, fmtActor, ACTOR_JS } from './diag.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const queries = opt('moments', 'first_user_test; open_plan_office --seed 3').split(';').map((q) => q.trim()).filter(Boolean);
const seconds = Number(opt('seconds', 10));
const MOVE_M = 0.3;

// Virtual time for the page. __frame(n) advances n frames: due timers run, then the frames' rAFs.
const SHIM = `(() => {
  let now = 0, seq = 1, rafs = [];
  const timers = new Map();
  let s = 20260925;
  Math.random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  performance.now = () => now;
  Date.now = () => 1790000000000 + now;
  window.setTimeout = (fn, ms = 0, ...a) => { const id = seq++; timers.set(id, { at: now + Math.max(0, Number(ms) || 0), fn, a }); return id; };
  window.setInterval = (fn, ms = 0, ...a) => { const id = seq++; timers.set(id, { at: now + Math.max(1, Number(ms) || 0), fn, a, every: Math.max(1, Number(ms) || 0) }); return id; };
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
  window.requestAnimationFrame = (cb) => { const id = seq++; rafs.push({ id, cb }); return id; };
  window.cancelAnimationFrame = (id) => { rafs = rafs.filter((r) => r.id !== id); };
  const run = (fn, a) => { try { if (typeof fn === 'function') fn(...a); } catch (e) { console.error(e); } };
  window.__frame = (n = 1) => {
    for (let i = 0; i < n; i++) {
      now += 1000 / 30;
      for (const [id, t] of [...timers].sort((x, y) => x[1].at - y[1].at)) {
        if (t.at > now) continue;
        if (t.every) t.at += t.every; else timers.delete(id);
        run(t.fn, t.a);
      }
      const due = rafs; rafs = [];
      for (const r of due) run(r.cb, [now]);
    }
  };
})();`;

const mode = glMode({ argv });
holdRenderLock(mode);
const server = await createServer({ server: { port: 0, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const { browser } = await launchChromium(chromium, { mode, label: 'loop' });
let failed = 0;
try {
  for (const query of queries) {
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
    const res = await page.evaluate(({ seconds }) => {
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
      for (let f = 0; f < seconds * 30 && S().pendingDecision; f++) {
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
        }
      }
      return { eventId, subject: S().pendingDecision?.subjectId ?? null, trace: R.trace?.lines(20) ?? [], waited: +(waited / 30).toFixed(1), open: !!S().pendingDecision, frames, frozen, actors: [...actors].map(([id, a]) => ({ id, moment: a.what, moved: +a.far.toFixed(2) })) };
    }, { seconds });
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
      if (had) Object.defineProperty(R, 'spotlight', had); else delete R.spotlight;
      return { perWeek, span, held, after, card, stuck };
    });
    const warned = warnings.some((w) => /spotlight .*stuck-1 held the clock/.test(w));
    const cardWarned = warnings.some((w) => /spotlight .*card-1 held the clock/.test(w));
    const c = r.card;
    const checks = [
      [r.held.weeks === 0, `no week passed in ${r.held.frames} frames of a spotlight (${(r.span / r.perWeek).toFixed(1)} weeks' worth)`],
      [r.held.frames === r.span && r.held.frozen === 0, `the office kept rendering, unfrozen (${r.held.frozen} frozen frames)`],
      [r.held.spot === r.span, `clock.spotlight reported it on every frame (${r.held.spot} of ${r.span})`],
      [r.after.weeks >= 2, `the weeks resumed after it ended (${r.after.weeks} in the same span)`],
      [c.found && c.stillOpen && !cardWarned && c.afterCard?.weeks === 0 && c.afterCard?.spot === r.span,
        c.found ? `a spotlight under the ${c.event} card for 62 s still held the clock after the card resolved (${c.afterCard?.weeks} weeks, spotlight on ${c.afterCard?.spot} of ${r.span} frames${cardWarned ? ', but it was let go' : ''})` : 'no decision card came up to hold a spotlight under'],
      [r.stuck.weeks >= 1 && warned, `one held past the cap was let go (${r.stuck.weeks} weeks after, warning ${warned ? 'logged' : 'missing'})`],
    ];
    const pass = checks.every(([ok]) => ok) && !errors.length;
    if (!pass) failed++;
    console.log(`LOOP ${pass ? 'ok  ' : 'FAIL'} spotlight hold: ${checks.map(([ok, text]) => `${ok ? '' : 'NOT: '}${text}`).join('; ')}`);
    if (errors.length) console.log(`page errors: ${errors.slice(0, 3).join('; ')}`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
const total = queries.length + (argv.includes('--no-spotlight') ? 0 : 1);
console.log(`loop: ${total - failed} of ${total} checks passed through the game loop`);
process.exit(failed ? 1 : 0);
