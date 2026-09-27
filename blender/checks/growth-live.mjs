// Growth producers delivered by the real main.js loop, with bounded lifetime and pool checks.
// Run under timeout; the existing GL helper acquires the render lock.
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { glMode, holdRenderLock, launchChromium } from '../../scripts/lib/gl.js';
import { game, addStaff } from '../../tests/sim/helpers.js';
import { findSpot, assignSeats, layoutOf } from '../../src/sim/office.js';
import { B } from '../../src/sim/balance.js';
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
const args = process.argv.slice(2), opt = (k, d) => args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d;
const root = path.resolve(opt('root', '.')), kind = opt('case', 'small'), quality = opt('quality', 'medium');
const out = opt('out', null), count = kind === 'burst' ? 40 : 4, frames = Number(opt('frames', 600));
const mode = glMode(); holdRenderLock(mode);
const state = game(42);
state.era = { id: 'classic', since: 0 };
state.cash = 1e8; state.week = 20; state.officeStage = count === 40 ? 2 : 0;
state.office.expansion = count === 40 ? 2 : 0;
state.flags.lastDecisionWeek = state.week;
state.pendingDecision = null; state.chatPrompts = []; state.policies = {}; state.staff = []; state.office.placed = [];
for (let i = 0; i < count; i++) {
  const spot = findSpot(layoutOf(state), state.office.placed, 'desk', [Number(opt('desk-rot', 0))]);
  if (!spot) throw Error(`no room for desk ${i}`);
  state.office.placed.push({ id: `d${state.nextId++}`, itemId: 'desk', level: 1, ...spot });
  addStaff(state, 'engineer', 'junior', { level: 2, xp: 0, hiredWeek: 0, traits: [], assignment: { type: args.includes('--standing') ? 'oversight' : 'maintenance', targetId: null }, mood: 'ok' });
}
assignSeats(state);
const star = state.staff[0];
if (kind === 'mid' || kind === 'senior') { star.level = (kind === 'mid' ? B.promoteMidLevel : B.promoteSeniorLevel) - 1; star.seniority = kind === 'mid' ? 'junior' : 'mid'; }
if (kind === 'trait') star.record.mentorWeeks = 100;
if (kind === 'small' || kind === 'mid' || kind === 'senior') star.xp = B.xpPerLevel * star.level;
if (kind === 'burst') for (const p of state.staff) p.xp = B.xpPerLevel * p.level;
if (out) { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'input.json'), JSON.stringify(state)); }
const server = await createServer({ root, server: { port: 0, hmr: false }, logLevel: 'error' }); await server.listen();
const { browser } = await launchChromium(chromium, { mode, label: 'growth-live' });
if (out) fs.mkdirSync(out, { recursive: true });
const errors = [], rows = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { window.__wallNow = performance.now.bind(performance); });
  await page.addInitScript(SHIM);
  await page.goto(`${server.resolvedUrls.local[0]}?seed=42&quality=${quality}&rig=${opt('rig', '1')}&time=0.45`, { waitUntil: 'load' });
  for (let i = 0; i < 600; i++) {
    if (await page.evaluate(() => !!(window.__HITL && window.__hitlRender?.ready))) break;
    await page.evaluate(() => { window.__HITL?.setSpeed(0); window.__frame(1); }); await new Promise(r => setTimeout(r, 50));
  }
  await page.evaluate(async ({ state, speed, kind, view }) => {
    const { saveGame } = await import('/src/save/save.js');
    saveGame(state);
    const H = window.__HITL, R = window.__hitlRender;
    const loaded = H.controls.continueGame(); if (!loaded.ok) throw Error(JSON.stringify(loaded));
    H.controls.setAutoPause(false); H.setSpeed(speed);
    window.__events = [];
    const old = R.handleEvents.bind(R);
    R.handleEvents = (events, state) => { window.__events.push(...events.map(e => ({ ...e, frame: window.__growthFrame }))); return old(events, state); };
    if (view) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', code: 'KeyE', bubbles: true }));
    window.__frame(2);
    if (kind === 'trained') H.dispatch({ type: 'train', staffId: H.state.staff[0].id, program: 'workshop', focus: 'polish' });
  }, { state, speed: kind === 'burst' ? 4 : 1, kind, view: Number(opt('view', 0)) });
  if (args.includes('--geometry')) await page.evaluate(async () => { window.__growthGeometry = await import('/blender/checks/intersect.js'); });
  let stopped = false;
  for (let f = 0; f < frames; f++) {
    const row = await page.evaluate(({ f, kind }) => {
      window.__growthFrame = f;
      const R = window.__hitlRender, start = window.__wallNow();
      window.__frame(1);
      document.querySelector('#scene').getContext('webgl2').finish();
      const ms = window.__wallNow() - start;
      const labels = [...document.querySelectorAll('.hitl-growth')].filter(e => e.isConnected && Number(e.style.opacity) > 0).map(e => e.textContent);
      let collision = [], cover = 0;
      const X = window.__growthGeometry;
      if (X && R.stats.growth?.live) {
        const world = X.bodies(R), all = X.people(R, world), actors = all.filter(p => /^growth/.test(p.anim));
        collision = X.crossOverlaps(actors, world, { tol: 0.02, skip: (a,b) => a.own.has(b.key) }).map(o => ({ a: o.a.id, b: o.b.key, depth: o.depth }));
        collision.push(...X.overlaps(all, { tol: 0.02 }).filter(o => actors.includes(o.a) || actors.includes(o.b)).map(o => ({ a: o.a.id, b: o.b.id, depth: o.depth })));
        for (const actor of actors) {
          const meshes = []; actor.obj.traverse(o => { if (o.isMesh && ['armL', 'armR'].includes(o.userData.part)) meshes.push(o); });
          const arms = { ...actor, meshes, box: new R.THREE.Box3() };
          for (const mesh of meshes) arms.box.union(new R.THREE.Box3().setFromObject(mesh));
          collision.push(...X.crossOverlaps([arms], world, { tol: 0.02 }).map(o => ({ a: actor.id + ':arms', b: o.b.key, depth: o.depth })));
          const head = { ...actor, meshes: actor.meshes.filter(o => o.userData.part === 'head') };
          collision.push(...X.crossOverlaps([arms], [head], { tol: 0.02 }).map(o => ({ a: actor.id + ':arms', b: actor.id + ':head', depth: o.depth })));
        }
        const sc = X.screen(R);
        for (const l of sc.labels.filter(l => labels.includes(l.text))) for (const face of sc.faces) cover = Math.max(cover, X.rectOverlap(l.r, face.r).share);
      }
      return { frame: f, ms, collision, cover, week: window.__HITL.state.week, ...R.stats, calls: R.perf.calls, labelsText: labels, actors: kind === 'burst' ? [] : window.__HITL.state.staff.map(p => ({ id: p.id, anim: R.probe(p.id)?.anim, temp: R.walkOf(p.id)?.temp?.moment })), decision: window.__HITL.state.pendingDecision?.eventId, spotlight: R.spotlight()?.kind ?? null };
    }, { f, kind });
    rows.push(row);
    if (!stopped && opt('stop', null) && row.growth?.live) {
      stopped = true;
      await page.evaluate(async mode => {
        const H = window.__HITL, R = window.__hitlRender, id = H.state.staff[0].id;
        if (mode === 'pause') H.setSpeed(0);
        if (mode === 'speed') H.setSpeed(4);
        if (mode === 'load') { H.controls.save(); H.controls.continueGame(); }
        if (mode === 'departure') H.dispatch({ type: 'fire', staffId: id });
        if (mode === 'priority') R.catchFor(id, { anim: 'readpaper', t: 10, moment: 'letter', keepPos: true });
        if (mode === 'hidden') H.state.staff[0].remote = true;
        if (mode === 'menu') document.querySelector('[data-menu="staff"]')?.click();
      }, opt('stop', null));
    }
    if (out && args.includes('--capture') && f % 3 === 0) await page.screenshot({ path: path.join(out, `frame-${String(f).padStart(4, '0')}.png`) });
  }
  const events = await page.evaluate(() => window.__events);
  const shown = rows.filter(r => r.labelsText.length);
  const expected = { small: 'levelUp', mid: 'promoted', senior: 'promoted', trait: 'traitEarned', trained: 'skillTrained', burst: 'levelUp' }[kind];
  const produced = events.filter(e => e.type === expected);
  const fullLifetime = kind === 'burst' || opt('stop', null) || shown.length >= Math.floor((kind === 'small' ? B.growthOffice.smallSeconds : B.growthOffice.mediumSeconds) * 30) - 1;
  const acknowledgement = kind === 'small' || kind === 'burst' || opt('stop', null) || rows.some(r => r.actors.some(a => /^growthclap/.test(a.anim)));
  const times = rows.map(r => r.ms).sort((a,b) => a-b);
  const result = { fullLifetime: !!fullLifetime, acknowledgement: !!acknowledgement, deskRotation: opt('desk-rot', 0), standing: args.includes('--standing'), stop: opt('stop', null), stopped, collisions: rows.flatMap(r => r.collision), worstCover: Math.max(...rows.map(r => r.cover)), root, kind, quality, count, view: opt('view', 0), rig: opt('rig', '1'), frames, produced, errors, first: shown[0]?.frame, last: shown.at(-1)?.frame, peak: Math.max(...rows.map(r => r.growth?.live ?? 0)), p50: times[Math.floor(times.length * 0.5)], p95: times[Math.floor(times.length * 0.95)], calls: [Math.min(...rows.map(r => r.calls)), Math.max(...rows.map(r => r.calls))], rows, events };
  if (out) fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, rows: undefined, events: undefined }, null, 2));
  if (errors.length || !produced.length || result.collisions.length || (opt('stop', null) && !stopped) || (!args.includes('--baseline') && (!shown.length || !fullLifetime || !acknowledgement || rows.at(-1).growth.live || result.peak > B.growthOffice.liveMax))) process.exitCode = 1;
} finally { await browser.close(); await server.close(); }
