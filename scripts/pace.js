// Wall-clock pacing simulator: plays the real sim through src/pacing.js with a simulated player
// and reports what a person would see, and when, in real time. Not real time itself: frames are
// stepped as fast as the machine allows.
//
// node scripts/pace.js [--seed 1] [--speed 1] [--bot sensible] [--minutes 30 | --weeks 200]
//                 [--player batch|eager|both] [--milestones] [--timeline] [--json] [--frame 0.0333]
//
// --milestones prints only the one-line milestone timeline; --player both runs each player.
// --check tests the milestone line against PACING_TARGETS and exits non-zero on a miss.
//
// Players: 'batch' opens menus every few weeks, or sooner when something needs attention (a
// decision, an unlock, a launch, cash below zero), and the bot's changes wait for that session.
// 'eager' acts every week exactly like the balance harness, so the game matches runBot.
import { createGame, tick, dispatch } from '../src/sim/index.js';
import * as bots from '../src/sim/bots.js';
import { EVENTS } from '../src/data/events.js';
import { createPacer, WEEK_SECONDS, BUBBLE_SECONDS } from '../src/pacing.js';

// Modelled human time, in real seconds. Each range is [min, max], drawn uniformly.
const HUMAN = {
  decision: [6, 12],       // read a decision popup and pick (the sim waits)
  menuBase: [3, 5],        // open menus for the week's actions (the UI auto-pauses)
  menuPerAction: [1.5, 2.5],
  batchWeeks: [3, 6],      // weeks between menu sessions for a batching player
  launch: [4, 6],          // read the launch results popup
  eraCard: [5, 8],         // the era announcement card
  unlockCard: [2, 4],      // the first-time explainer for a newly unlocked system
};
// Mirrors of UI and renderer constants the presentation depends on.
const UI = {
  toastBudget: 3,          // info and good toasts per game week; warn and bad always show
  toastDedupSeconds: 0.8,
  maxSpeech: 4,
  bubbleFade: 0.25,        // seconds; a bubble cut shorter than this still reads as whole            // speech bubbles on screen before the renderer drops new ones
  standupGather: 2.2,
  standupStageEvery: { 1: 3, 2: 6 }, // game weeks between staged standups at 1x, and at 2x and up
  deskStandupBubble: 2.4, // seconds for the one spoken update on unstaged standup weeks      // seconds (scaled by speed, max 2x) to gather before a daily standup talks
};

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true;
    else { out[a.slice(2)] = next; i++; }
  }
  return out;
}

// The player's own randomness, separate from the sim's so modelled time never changes the game.
function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The bots' decision choice (bots.js keeps its own copy private).
function pickDecision(s, scorer) {
  const d = s.pendingDecision;
  const ev = EVENTS[d.eventId];
  let best = null;
  d.choices.forEach((c, i) => {
    if (c.available === false) return;
    const v = scorer(s, d, ev?.choices[i]?.effects ?? {}, i);
    if (!best || v > best.v) best = { i, v };
  });
  return best?.i ?? 0;
}

// Bots dispatch internally, so the week's player actions are counted from what changed.
function fingerprint(s) {
  return {
    staff: new Map(s.staff.map((p) => [p.id, `${p.assignment.type}:${p.assignment.targetId}:${p.path}`])),
    automation: JSON.stringify(s.automation),
    policies: new Set(Object.keys(s.policies).filter((k) => s.policies[k])),
    projects: new Set(s.projects.map((j) => j.id)),
    campaigns: new Set(s.campaigns.map((c) => c.id)),
    stage: s.officeStage,
    placed: JSON.stringify(s.office?.placed ?? s.items ?? []),
    tooling: s.security.tooling,
    audit: s.security.auditBoost,
    cash: s.cash,
  };
}

function countActions(a, b) {
  let n = 0;
  const newStaff = [];
  for (const [id, v] of b.staff) {
    if (!a.staff.has(id)) newStaff.push(id);
    else if (a.staff.get(id) !== v) n++;
  }
  for (const id of a.staff.keys()) if (!b.staff.has(id)) n++;
  n += newStaff.length;
  if (a.automation !== b.automation) {
    const x = JSON.parse(a.automation), y = JSON.parse(b.automation);
    for (const fn of Object.keys(y)) if (JSON.stringify(x[fn]) !== JSON.stringify(y[fn])) n++;
  }
  for (const k of b.policies) if (!a.policies.has(k)) n++;
  for (const k of a.policies) if (!b.policies.has(k)) n++;
  for (const id of b.projects) if (!a.projects.has(id)) n++;
  for (const id of b.campaigns) if (!a.campaigns.has(id)) n++;
  if (a.stage !== b.stage) n++;
  if (a.placed !== b.placed) n++;
  if (a.tooling !== b.tooling) n++;
  if (b.audit > a.audit) n++;
  return { n, newStaff };
}

function sessionCount(timeline) {
  const out = { total: 0 };
  for (const e of timeline) {
    if (e.kind !== 'menu') continue;
    out.total++;
    const why = e.text.split(', ')[2] ?? 'weekly';
    out[why] = (out[why] ?? 0) + 1;
  }
  return out;
}

const STAGE_NAMES = ['garage', 'floor', 'hq'];

// One line: minute and label of each milestone in order, unlocks marked with +.
const milestoneLine = (m) => (m.milestones.length ? m.milestones.map((x) => `${x.minute} ${x.label}`).join(' | ') : 'none');

// Where the milestones should land at 1x, in real minutes.
const PACING_TARGETS = { floor: [7, 10], hq: [20, 30], maxUnlocksPerMinute: 2 };

// Pass or fail per target. Unlocks that arrive with an era do not count toward the per-minute cap.
function checkTargets(m) {
  const at = (label) => m.milestones.find((x) => x.label === label)?.minute ?? null;
  const within = (v, [lo, hi]) => v !== null && v >= lo && v <= hi;
  const eraMinutes = new Set(m.milestones.filter((x) => x.label.startsWith('era ')).map((x) => x.minute));
  const perMinute = new Map();
  for (const x of m.milestones) {
    if (!x.label.startsWith('+') || eraMinutes.has(x.minute)) continue;
    const k = Math.floor(x.minute);
    perMinute.set(k, (perMinute.get(k) ?? 0) + 1);
  }
  const worst = [...perMinute.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  return [
    { target: `floor at ${PACING_TARGETS.floor.join(' to ')} min`, ok: within(at('floor'), PACING_TARGETS.floor), got: at('floor') },
    { target: `hq at ${PACING_TARGETS.hq.join(' to ')} min`, ok: within(at('hq'), PACING_TARGETS.hq), got: at('hq') },
    { target: `at most ${PACING_TARGETS.maxUnlocksPerMinute} unlocks in any minute outside eras`, ok: worst[1] <= PACING_TARGETS.maxUnlocksPerMinute, got: worst[0] === null ? 0 : `${worst[1]} in minute ${worst[0]}` },
  ];
}

const mmss = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const pct = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * arr.length))] : null);
const r1 = (x) => (x === null || x === undefined ? null : Math.round(x * 10) / 10);
const r2 = (x) => (x === null || x === undefined ? null : Math.round(x * 100) / 100);

export function simulatePacing({ seed = 1, speed = 1, bot = 'sensible', player = 'batch', minutes = null, weeks = null, frame = 1 / 30 } = {}) {
  if (!['batch', 'eager'].includes(player)) throw new Error(`Unknown player "${player}". Players: batch, eager`);
  if (!bots.BOTS[bot]) throw new Error(`Unknown bot "${bot}". Bots: ${Object.keys(bots.BOTS).join(', ')}`);
  const limitSeconds = minutes !== null ? minutes * 60 : weeks === null ? 30 * 60 : Infinity;
  const limitWeeks = weeks ?? Infinity;
  const state = createGame({ seed, companyName: `Pace ${bot}` });
  const chooser = bots.CHOOSERS[bot];
  // With the sim's event sink (botTurn, botDecide) the player's own events are presented too.
  const sinkApi = typeof bots.botTurn === 'function' && typeof bots.botDecide === 'function';
  const rand = mulberry(seed ^ 0x9e3779b9);
  const draw = ([a, b]) => a + rand() * (b - a);
  const pacer = createPacer();

  let t = 0; // real seconds
  const timeline = [];
  const log = (kind, text, extra = {}) => timeline.push({ t, week: state.week, kind, text, ...extra });

  // Player activity: at most one of these at a time.
  let reading = null; // { until } while reading a decision (the sim holds time itself)
  let menu = null; // { until, kind } while a menu, launch popup, or card is open (the UI auto-pauses)
  const cards = []; // queued modal cards: { kind, seconds, text }
  const launchQueue = [];
  const launchScores = new Map();
  let botDue = true;
  let nextSession = 0; // batch player: the week of the next routine menu session
  let attention = null; // batch player: why the next session comes early

  // Toasts as the UI shows them.
  let toastWeek = null, shownThisWeek = 0, lastToast = { text: '', t: -1e9 };
  const toastStats = { shown: 0, held: 0, byTone: { info: 0, good: 0, warn: 0, bad: 0 } };
  function toast(text, tone = 'info', action = false) {
    if (!text) return;
    if (state.week !== toastWeek) { toastWeek = state.week; shownThisWeek = 0; }
    const tn = ['info', 'good', 'warn', 'bad'].includes(tone) ? tone : 'info';
    if (tn !== 'warn' && tn !== 'bad' && !action && shownThisWeek >= UI.toastBudget) {
      toastStats.held++;
      log('toast-held', text, { tone: tn });
      return;
    }
    shownThisWeek++;
    if (text === lastToast.text && t - lastToast.t < UI.toastDedupSeconds) return;
    lastToast = { text, t };
    toastStats.shown++;
    toastStats.byTone[tn]++;
    log('toast', text, { tone: tn });
  }

  // Speech bubbles as the renderer shows them.
  const bubbles = []; // { who, start, end }
  const bubbleStats = { shown: 0, dropped: 0, overlaps: [], maxConcurrent: 0 };
  const onScreen = (at) => bubbles.filter((b) => b.start <= at && b.end > at);
  function bubble(who, text, start, seconds, source) {
    const live = onScreen(start);
    const mine = live.find((b) => b.who === who);
    // A trim shorter than the bubble's fade-out is not visible, so only longer cuts count.
    if (mine && mine.end - start > UI.bubbleFade) {
      bubbleStats.overlaps.push({ t: start, week: state.week, who, text, cutShort: r2(mine.end - start), source });
      mine.end = start;
    } else if (mine) {
      mine.end = start;
    } else if ((source === 'say' || source === 'standup-desk') && live.length >= UI.maxSpeech) {
      bubbleStats.dropped++;
      return;
    }
    bubbles.push({ who, start, end: start + seconds });
    bubbleStats.shown++;
    bubbleStats.maxConcurrent = Math.max(bubbleStats.maxConcurrent, onScreen(start).length);
  }

  const present = new Set();
  const refreshPresent = () => {
    present.clear();
    for (const p of state.staff) if (p.mood !== 'away' && p.assignment?.type !== 'sabbatical') present.add(p.id);
  };

  const firsts = { launch: null, era: {}, goal: {}, unlock: {} };
  const milestones = []; // { minute, week, label } for first launch, office stages, eras, unlocks
  const milestone = (label) => milestones.push({ minute: r1(t / 60), week: state.week, label });
  const decisions = [];
  let lastStaged = -Infinity;
  const counts = { chat: 0, chatBot: 0, sayDropped: 0, says: 0, standupsStaged: 0, incidents: 0, launches: 0, launchPopups: 0, standups: 0 };

  function route(events) {
    if (!events?.length) return;
    refreshPresent();
    for (const e of events) {
      switch (e.type) {
        case 'toast': toast(e.text, e.tone, /ready to choose a career path/.test(e.text)); break;
        case 'hire': {
          const p = state.staff.find((x) => x.id === e.staffId);
          if (p) toast(`${p.name} joined the team!`, 'good');
          break;
        }
        case 'award': toast(e.text, 'good'); break;
        case 'officeUpgrade': milestone(STAGE_NAMES[e.stage] ?? `stage ${e.stage}`); toast('Moved into a bigger office!', 'good'); break;
        case 'incident': {
          counts.incidents++;
          const p = state.products.find((x) => x.id === e.productId);
          log('incident', `${e.kind}${p ? ` on ${p.name}` : ''}${e.caught ? ' (caught)' : ` SEV${6 - e.severity}`}`);
          toast(e.caught ? 'An overseer caught an incident!' : 'Incident', e.caught ? 'good' : 'bad');
          break;
        }
        case 'launch': {
          counts.launches++;
          const p = state.products.find((x) => x.id === e.productId);
          const prev = launchScores.get(e.productId);
          if (p) launchScores.set(e.productId, p.score);
          const popup = !p || p.version <= 1 || prev === undefined || Math.abs(p.score - prev) > 0.5;
          if (p?.version === 1 && firsts.launch === null) { firsts.launch = t; milestone('first launch'); }
          log('launch', `${p?.name ?? e.productId} v${p?.version ?? '?'} score ${p ? r1(p.score) : '?'}${popup ? '' : ' (no popup)'}`);
          if (popup) launchQueue.push(p?.name ?? e.productId);
          attention ??= 'launch';
          break;
        }
        case 'decision': {
          const d = state.pendingDecision;
          log('decision', d ? d.title : '(decision)');
          decisions.push(t);
          break;
        }
        case 'era': if (firsts.era[e.eraId] === undefined) milestone(`era ${e.eraId}`); firsts.era[e.eraId] ??= t; log('era', e.eraId); cards.push({ kind: 'era', seconds: draw(HUMAN.eraCard), text: e.eraId }); break;
        case 'unlock': attention ??= 'unlock'; if (firsts.unlock[e.key] === undefined) milestone(`+${e.key}`); firsts.unlock[e.key] ??= t; log('unlock', e.key); cards.push({ kind: 'unlock', seconds: draw(HUMAN.unlockCard), text: e.key }); break;
        case 'goal': firsts.goal[e.goalId] ??= t; log('goal', e.goalId); break;
        case 'chat': {
          counts.chat++;
          if (!e.fromId) counts.chatBot++;
          log('chat', `#${e.channel} ${e.from}: ${e.text}`, { reply: !!e.replyTo });
          break;
        }
        case 'say': {
          if (e.dropped) { counts.sayDropped++; log('say-drop', `${e.staffId}: ${e.text}`); break; }
          counts.says++;
          log('say', `${e.staffId}${e.toId ? ` to ${e.toId}` : ''}: ${e.text}`, { reply: !!e.replyTo });
          if (e.text && present.has(e.staffId)) bubble(e.staffId, e.text, t, BUBBLE_SECONDS, 'say');
          break;
        }
        case 'standup': {
          counts.standups++;
          log('standup', `${e.mode}, ${e.lines.length} lines`);
          // The renderer stages an in-person standup only every few weeks; other weeks get desk
          // emotes and the shortest line as one bubble.
          const staged = e.mode === 'daily' && speed < 4 && state.week - lastStaged >= UI.standupStageEvery[speed >= 2 ? 2 : 1];
          if (e.mode === 'daily' && !staged && speed < 4) {
            const line = e.lines.filter((l) => l.text && present.has(l.staffId)).sort((a, b) => a.text.length - b.text.length)[0];
            if (line) bubble(line.staffId, line.text, t, UI.deskStandupBubble, 'standup-desk');
          }
          if (staged && e.lines.some((l) => present.has(l.staffId))) {
            lastStaged = state.week;
            counts.standupsStaged++;
            const k = speed >= 2 ? 2 : 1;
            let at = t + UI.standupGather / k + 0.2 / k;
            for (const l of e.lines) {
              if (!present.has(l.staffId)) continue;
              const beat = (l.text ? 0.9 + Math.min(0.6, l.text.length * 0.018) : 0.6) / k;
              if (l.text) bubble(l.staffId, l.text, at, Math.max(0.6, beat - 0.1), 'standup');
              at += beat;
            }
          }
          break;
        }
        case 'gameOver': log('gameOver', state.gameOver ? `${state.gameOver.won ? 'won' : 'lost'}: ${state.gameOver.reason}` : ''); break;
        default: break;
      }
    }
  }

  const paused = { decision: 0, menu: 0, sessions: 0 };
  let lastEra = state.era?.id ?? null;

  while (t < limitSeconds && state.week < limitWeeks && !state.gameOver) {
    // The player: a decision first (the popup is on top), then cards, launch results, the week's menus.
    if (!menu && state.pendingDecision) {
      if (!reading) reading = { until: t + draw(HUMAN.decision) };
      else if (t >= reading.until) {
        attention ??= 'decision';
        const title = state.pendingDecision.title;
        if (sinkApi) {
          const out = [];
          bots.botDecide(bot, state, { onEvents: (ev) => out.push(...ev) });
          log('choice', title);
          route(out);
        } else {
          const choice = pickDecision(state, chooser);
          const res = dispatch(state, { type: 'resolveDecision', choice });
          log('choice', `${title}: ${state.pendingDecision ? '(still pending)' : `choice ${choice}`}`);
          route(res.events);
          if (!res.ok) for (let c = 0; c < 4 && state.pendingDecision; c++) route(dispatch(state, { type: 'resolveDecision', choice: c }).events);
        }
        reading = null;
      }
    } else if (!menu && cards.length) {
      const c = cards.shift();
      menu = { until: t + c.seconds, kind: `${c.kind} card` };
    } else if (!menu && launchQueue.length) {
      launchQueue.shift();
      counts.launchPopups++;
      menu = { until: t + draw(HUMAN.launch), kind: 'launch' };
    } else if (!menu && botDue && !state.pendingDecision && (player === 'eager' || attention || state.week >= nextSession)) {
      botDue = false;
      const why = player === 'eager' ? '' : attention ? `, ${attention}` : ', routine';
      if (player === 'batch') { nextSession = state.week + Math.round(draw(HUMAN.batchWeeks)); attention = null; }
      const before = fingerprint(state);
      const out = [];
      if (sinkApi) bots.botTurn(bot, state, { onEvents: (ev) => out.push(...ev) });
      else for (const a of bots.BOTS[bot](state) ?? []) dispatch(state, a);
      const { n, newStaff } = countActions(before, fingerprint(state));
      // Without the sink the bot's events are lost; hires are the ones the diff can recover.
      route(sinkApi ? out : newStaff.map((staffId) => ({ type: 'hire', staffId })));
      if (n > 0) {
        const seconds = draw(HUMAN.menuBase) + n * draw(HUMAN.menuPerAction);
        menu = { until: t + seconds, kind: 'menu' };
        log('menu', `${n} action${n === 1 ? '' : 's'}, ${r1(seconds)}s${why}`);
      }
    }
    if (menu && t >= menu.until) menu = null;

    // One frame of main.js.
    const menuPause = !!menu;
    const running = !menuPause && !state.pendingDecision && !state.gameOver;
    if (menuPause) { paused.menu += frame; if (menu.kind === 'menu') paused.sessions += frame; }
    else if (state.pendingDecision) paused.decision += frame;
    if (pacer.step(frame, { speed, running })) {
      route(pacer.schedule(tick(state)));
      route(pacer.takeDropped().map((e) => ({ ...e, dropped: true })));
      botDue = true;
      if (state.cash < 0) attention ??= 'cash';
      if (state.era && state.era.id !== lastEra) {
        lastEra = state.era.id;
        if (firsts.era[lastEra] === undefined) milestone(`era ${lastEra}`);
        firsts.era[lastEra] ??= t;
      }
    }
    if (!menuPause) route(pacer.due());
    t += frame;
  }

  // Bubble density, sampled every 0.1 real seconds.
  let covered = 0, integral = 0, samples = 0;
  for (let x = 0; x < t; x += 0.1) {
    const n = onScreen(x).length;
    integral += n;
    if (n > 0) covered++;
    samples++;
  }
  const minutesPlayed = t / 60;
  const gaps = decisions.slice(1).map((x, i) => x - decisions[i]).sort((a, b) => a - b);
  const popups = decisions.length + counts.launchPopups + timeline.filter((e) => e.kind === 'era' || e.kind === 'unlock').length;
  const perMin = (n) => r2(n / Math.max(1e-9, minutesPlayed));
  const toMin = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, r1(v / 60)]));

  const metrics = {
    seed, speed, bot, player, playerEvents: sinkApi ? 'all' : 'hires only', weekSeconds: WEEK_SECONDS / speed,
    realMinutes: r1(minutesPlayed), weeks: state.week, gameOver: state.gameOver ? { won: state.gameOver.won, reason: state.gameOver.reason } : null,
    pausedShare: { decision: r2(paused.decision / t), menu: r2(paused.menu / t), menuSessions: r2(paused.sessions / t) },
    menuSessions: sessionCount(timeline),
    popupsPerMinute: perMin(popups),
    decisions: {
      count: decisions.length, perMinute: perMin(decisions.length),
      gapSeconds: gaps.length ? { min: r1(gaps[0]), p10: r1(pct(gaps, 0.1)), p25: r1(pct(gaps, 0.25)), median: r1(pct(gaps, 0.5)), p75: r1(pct(gaps, 0.75)), p90: r1(pct(gaps, 0.9)), max: r1(gaps.at(-1)), mean: r1(gaps.reduce((a, b) => a + b, 0) / gaps.length) } : null,
    },
    toasts: { shownPerMinute: perMin(toastStats.shown), heldPerMinute: perMin(toastStats.held), ...toastStats },
    chat: { linesPerMinute: perMin(counts.chat), lines: counts.chat, botLines: counts.chatBot },
    say: { linesPerMinute: perMin(counts.says), lines: counts.says, droppedStale: counts.sayDropped },
    standups: { count: counts.standups, staged: counts.standupsStaged },
    bubbles: {
      perMinute: perMin(bubbleStats.shown), meanOnScreen: r2(integral / Math.max(1, samples)), shareOfTimeAny: r2(covered / Math.max(1, samples)),
      maxConcurrent: bubbleStats.maxConcurrent, dropped: bubbleStats.dropped, overlaps: bubbleStats.overlaps.length,
    },
    launches: { count: counts.launches, popups: counts.launchPopups },
    incidents: counts.incidents,
    minutesTo: {
      firstLaunch: firsts.launch === null ? null : r1(firsts.launch / 60),
      era: toMin(firsts.era), goal: toMin(firsts.goal), unlock: toMin(firsts.unlock),
    },
    milestones,
  };
  return { metrics, timeline, overlaps: bubbleStats.overlaps, state };
}

function printSummary(m, overlaps) {
  const L = (k, v) => console.log(`${k.padEnd(26)}${v}`);
  console.log(`pacing: seed ${m.seed}, bot ${m.bot}, ${m.player} player, ${m.speed}x (${m.weekSeconds}s per week); player's own events: ${m.playerEvents}`);
  L('played', `${m.realMinutes} real min, ${m.weeks} weeks${m.gameOver ? `, game over (${m.gameOver.won ? 'won' : 'lost'}: ${m.gameOver.reason})` : ''}`);
  L('time paused', `decisions ${Math.round(m.pausedShare.decision * 100)}%, menus and popups ${Math.round(m.pausedShare.menu * 100)}% (menu sessions alone ${Math.round(m.pausedShare.menuSessions * 100)}%)`);
  L('menu sessions (w/ changes)', Object.entries(m.menuSessions).map(([k, v]) => `${k} ${v}`).join('  '));
  L('popups per minute', m.popupsPerMinute);
  L('decisions', `${m.decisions.count} (${m.decisions.perMinute}/min)`);
  if (m.decisions.gapSeconds) {
    const g = m.decisions.gapSeconds;
    L('  gap between (real s)', `min ${g.min}  p10 ${g.p10}  p25 ${g.p25}  median ${g.median}  p75 ${g.p75}  p90 ${g.p90}  max ${g.max}  mean ${g.mean}`);
  }
  L('toasts per minute', `${m.toasts.shownPerMinute} shown, ${m.toasts.heldPerMinute} held by the budget`);
  L('  shown by tone', Object.entries(m.toasts.byTone).map(([k, v]) => `${k} ${v}`).join('  '));
  L('Slackk lines per minute', `${m.chat.linesPerMinute} (${m.chat.lines} lines, ${m.chat.botLines} from bots)`);
  L('spoken lines per minute', `${m.say.linesPerMinute} (${m.say.lines} lines, ${m.say.droppedStale} dropped stale while the speaker talked)`);
  L('standups', `${m.standups.count} (${m.standups.staged} staged in person)`);
  L('speech bubbles', `${m.bubbles.perMinute}/min, mean ${m.bubbles.meanOnScreen} on screen, any up ${Math.round(m.bubbles.shareOfTimeAny * 100)}% of the time, max ${m.bubbles.maxConcurrent}`);
  L('  dropped at the cap', m.bubbles.dropped);
  L('  same-speaker overlaps', m.bubbles.overlaps);
  for (const o of overlaps.slice(0, 5)) console.log(`    ${mmss(o.t)} w${o.week} ${o.source} ${o.who} cut the last bubble ${o.cutShort}s short: ${o.text.slice(0, 60)}`);
  L('launches and updates', `${m.launches.count} (${m.launches.popups} popups), incidents ${m.incidents}`);
  L('milestones (real min)', milestoneLine(m));
  L('minutes to first launch', m.minutesTo.firstLaunch ?? 'never');
  for (const kind of ['era', 'unlock', 'goal']) {
    const e = Object.entries(m.minutesTo[kind]);
    L(`minutes to each ${kind}`, e.length ? e.map(([k, v]) => `${k} ${v}`).join(', ') : 'none presented');
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const a = parseArgs(process.argv.slice(2));
  const num = (k) => (a[k] === undefined || a[k] === true ? null : Number(a[k]));
  const players = a.player === 'both' ? ['batch', 'eager'] : [typeof a.player === 'string' ? a.player : 'batch'];
  const runs = players.map((player) => simulatePacing({
    seed: num('seed') ?? 1, speed: num('speed') ?? 1, bot: typeof a.bot === 'string' ? a.bot : 'sensible', player,
    minutes: num('minutes'), weeks: num('weeks'), frame: num('frame') ?? 1 / 30,
  }));
  if (a.check) {
    let failed = false;
    for (const { metrics: m } of runs) {
      console.log(`${m.bot} ${m.player} ${m.speed}x seed ${m.seed}: ${milestoneLine(m)}`);
      for (const c of checkTargets(m)) {
        failed ||= !c.ok;
        console.log(`  ${c.ok ? 'ok  ' : 'MISS'} ${c.target}: ${c.got ?? 'never'}`);
      }
    }
    if (runs[0].metrics.speed !== 1) console.log('note: the targets are for 1x');
    process.exitCode = failed ? 1 : 0;
  } else if (a.json) {
    const out = runs.map((res) => ({ metrics: res.metrics, overlaps: res.overlaps, ...(a.timeline ? { timeline: res.timeline } : {}) }));
    console.log(JSON.stringify(out.length === 1 ? out[0] : out, null, 2));
  } else if (a.milestones) {
    for (const { metrics: m } of runs) console.log(`${m.bot} ${m.player} ${m.speed}x seed ${m.seed} (${m.realMinutes} min, ${m.weeks} wk): ${milestoneLine(m)}`);
  } else {
    runs.forEach((res, i) => {
      if (i) console.log('');
      if (a.timeline) {
        for (const e of res.timeline) console.log(`${mmss(e.t)}  w${String(e.week).padStart(3)}  ${e.kind.padEnd(10)} ${e.text}`);
        console.log('');
      }
      printSummary(res.metrics, res.overlaps);
    });
  }
}
