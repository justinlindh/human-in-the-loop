// Replays the trailer's and the landing page's capture setups against the sim alone, and reports the
// moment each one lands on, so a sim change that moves a beat shows up before video's rebuild does.
//
// A setup is page JS written for the browser. It runs here with the real sim, a stubbed page (every
// DOM call is a no-op) and a stubbed store, so LOAD_PIN loads its .snap through the game's own save.
// The moment is the state the setup leaves plus what the next week's tick raises: a pin and a
// PRE_UNTIL both stop the week before the beat's subject arrives. Compare a branch with main through
// ab.sh: `scripts/tools/ab.sh -- node tests/sim/trailer-beats/replay.mjs --json`.
//
//   node tests/sim/trailer-beats/replay.mjs [--only id,id] [--json] [--root <checkout>]
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// `--root <dir>` replays another checkout's sim and beats with this script, for a base that predates it.
const rootArg = process.argv.indexOf('--root');
const ROOT = rootArg > 0 ? resolve(process.argv[rootArg + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const url = (p) => pathToFileURL(resolve(ROOT, p)).href;

// The beats video ships: every trailer capture, every trailer pin's source, and the landing page's
// captures (feature-media items named site-*). An item without a setup has no moment to check, and an
// item that opens at an indexed `moment` follows the sim by itself (the event index finds it again).
export async function beatList() {
  const items = async (p) => { try { return (await import(url(p))).ITEMS; } catch { return []; } };
  const trailer = await items('scripts/trailer/manifest.js');
  const pins = await items('scripts/trailer/pin-manifest.js');
  const site = (await items('scripts/feature-media/manifest.js')).filter((i) => i.id.startsWith('site-'));
  const seen = new Map();
  for (const it of [...trailer, ...pins, ...site]) if (it.setup && !it.moment && !seen.has(it.id)) seen.set(it.id, it);
  return [...seen.values()];
}

// The moment a stored trailer pin loads into, for comparing with a fresh replay of its source.
async function pinnedMoment(name) {
  const sim = await import(url('src/sim/index.js'));
  const { PIN_DIR } = await import(url('scripts/trailer/pins.js'));
  const { gunzipSync } = await import('node:zlib');
  try {
    return moment(sim, JSON.parse(gunzipSync(readFileSync(resolve(ROOT, PIN_DIR, `${name}.snap`))).toString()));
  } catch {
    return null;
  }
}

// A value that accepts any property read, call, construction or iteration, for page code the sim
// does not need (styles, buttons, keyboard events, the renderer).
const inert = () => {
  const f = function () {};
  const p = new Proxy(f, {
    get: (_, k) => (k === Symbol.iterator ? function* () {} : k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : p),
    apply: () => p,
    construct: () => p,
    set: () => true,
    has: () => true,
  });
  return p;
};

function memoryStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }, clear: () => m.clear() };
}

const seedOf = (query) => Number(new URLSearchParams(query ?? '').get('seed') ?? 1);

// Runs one item's setup and returns its moment, or { error } when the setup throws.
export async function replayBeat(item) {
  const sim = await import(url('src/sim/index.js'));
  const save = await import(url('src/save/save.js'));
  const store = memoryStore();
  const H = {
    state: sim.createGame({ seed: seedOf(item.query) }),
    clock: { busy: false },
    emit() {}, setSpeed() {},
    dispatch(action) { return sim.dispatch(H.state, action); },
    controls: { continueGame() { const r = save.loadGame(store); if (r.ok) H.state = r.state; const { state: _s, ...rest } = r; return rest; } },
  };
  const stub = inert();
  const page = {
    __HITL: H, __hitlRender: stub, __capture: { now: 0 }, __captureMarks: [], innerWidth: 1920, innerHeight: 1080,
    addEventListener() {}, dispatchEvent() {}, requestAnimationFrame() {}, location: { href: 'http://localhost/' },
  };
  const globals = {
    window: new Proxy(page, { get: (t, k) => (k in t ? t[k] : stub), set: (t, k, v) => { t[k] = v; return true; } }),
    document: stub, localStorage: store, dispatchEvent() {}, addEventListener() {}, requestAnimationFrame() {},
    KeyboardEvent: class {}, CustomEvent: class {}, CSS: { escape: String }, innerWidth: 1920, innerHeight: 1080,
    fetch: async (path) => {
      try { return new Response(readFileSync(resolve(ROOT, String(path).replace(/^\//, '')))); } catch { return new Response(null, { status: 404 }); }
    },
  };
  const saved = {};
  for (const [k, v] of Object.entries(globals)) {
    saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  }
  try {
    // Page imports go through this module's own import(), which also works under a test runner.
    const js = item.setup.replace(/import\('\/(src\/[^']+)'\)/g, (_, p) => `__load(${JSON.stringify(url(p))})`);
    await new Function('__load', `return (${js});`)((u) => import(u));
  } catch (e) {
    return { error: String(e?.message ?? e).slice(0, 200) };
  } finally {
    for (const [k, d] of Object.entries(saved)) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  }
  return moment(sim, H.state);
}

const decisionOf = (s) => (s.pendingDecision ? `${s.pendingDecision.eventId}${s.pendingDecision.subjectId != null ? '@' + s.pendingDecision.subjectId : ''}` : null);
const outageOf = (s) => (s.outage ? `${s.outage.kind} sev ${s.outage.severity}${s.outage.misread ? ' misread' : ''}` : null);

// Where a setup left the game, and what the week after it raises.
export function moment(sim, s) {
  const at = { week: s.week, era: s.era?.id, stage: s.office?.stage, staff: s.staff.length, decision: decisionOf(s), outage: outageOf(s), over: !!s.gameOver };
  const next = structuredClone(s);
  const ev = s.gameOver ? [] : sim.tick(next) ?? [];
  const raised = [...new Set(ev.filter((e) => ['incident', 'robot', 'era', 'launch'].includes(e.type)).map((e) => e.type + (e.kind ? ':' + e.kind : '')))].sort();
  const out = { ...at, next: { decision: decisionOf(next), outage: outageOf(next), raised } };
  if (next.outage) out.next.memeReplies = memeReplies(sim, next);
  return out;
}

// The replies a meme posted now would queue (the Yak beat's thread needs two), or null if it can't be posted.
function memeReplies(sim, s) {
  const t = structuredClone(s);
  const r = sim.dispatch(t, { type: 'postMessage', id: 'meme' });
  return r.ok ? (t.flags.posts?.queue ?? []).filter((q) => q.replyTo === r.chatId).length : null;
}

export async function replayAll(only, onBeat = () => {}) {
  const out = {};
  for (const item of await beatList()) {
    if (only && !only.includes(item.id)) continue;
    const m = await replayBeat(item);
    // `stale`: a pin's source replay no longer lands where its stored snapshot does. The beats load the
    // snapshot, so this is for information; the pinned beats' own lines are what must hold.
    if (item.id.startsWith('pin-') && !m.error) {
      const pinned = await pinnedMoment(item.id.slice(4));
      m.stale = !pinned || JSON.stringify(pinned) !== JSON.stringify(m);
      if (m.stale) m.pinnedWeek = pinned?.week ?? null;
    }
    out[item.id] = m;
    onBeat(item.id, m);
  }
  return out;
}

const line = (m) => (m.error ? `ERROR ${m.error}`
  : `week ${m.week} ${m.decision ?? '-'} | ${m.outage ?? '-'} -> ${m.next.decision ?? '-'} | ${m.next.outage ?? '-'} | ${m.next.raised.join(' ') || '-'}${m.next.memeReplies !== undefined ? ` | meme replies ${m.next.memeReplies}` : ''}${m.stale ? ` | source drifted from the pin (snapshot at week ${m.pinnedWeek})` : ''}`);

const usage = (why) => {
  console.error(`replay: ${why}\nusage: node tests/sim/trailer-beats/replay.mjs [--only id,id] [--json] [--root <checkout>]`);
  process.exit(2);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const known = new Set(['--only', '--json', '--root']);
  for (let i = 0; i < args.length; i++) {
    if (!known.has(args[i])) usage(`unknown argument ${args[i]}`);
    if (args[i] !== '--json' && (!args[i + 1] || args[i + 1].startsWith('--'))) usage(`${args[i]} needs a value`);
    if (args[i] !== '--json') i++;
  }
  if (!existsSync(resolve(ROOT, 'src/sim/index.js'))) usage(`${ROOT} is not a checkout with a sim`);
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
  if (only) {
    const ids = new Set((await beatList()).map((i) => i.id));
    const missing = only.filter((id) => !ids.has(id));
    if (missing.length) usage(`no beat ${missing.join(', ')} (see the full list without --only)`);
  }
  const t0 = performance.now();
  const json = args.includes('--json');
  const now = await replayAll(only, (id, m) => { if (!json) console.log(id.padEnd(26), line(m)); });
  if (json) console.log(JSON.stringify(now, null, 2));
  console.error(`${Object.keys(now).length} beats in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}
