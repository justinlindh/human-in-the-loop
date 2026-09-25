import { B } from './balance.js';
import { chance, createRng, pick, shuffle, weighted, int } from './rng.js';
import { avg, article, clamp, newId, dateOf } from './util.js';
import { emitChat } from './chat.js';
import { automationExposure } from './automation.js';
import { eraAllowsText, currentEra, eraIndex } from './eras.js';
import { seatOf } from './office.js';
import { TALK, SAY_SOLO, RUNNING_JOKES, CAST_SPECS, SITUATIONS, AT_CHANNEL, AT_CHANNEL_WARRANTED } from '../data/talk.js';
import { CATEGORIES } from '../data/categories.js';
import { MODELS } from '../data/models.js';
import { ITEMS } from '../data/items.js';
import { incumbentFor } from '../data/incumbents.js';

const first = (p) => p.name.split(' ')[0];
const ONGOING = new Set(['outage', 'burnout', 'lowcash', 'lockdown', 'rival', 'pet']);
const inOffice = (p) => p.mood !== 'away' && !p.remote;
const around = (state) => state.staff.filter((p) => p.mood !== 'away');
const live = (state) => state.products.filter((p) => !p.killed);

// Per-run choices, rolled once from a side stream so they do not disturb the main one:
// which rare exchanges exist in this run and which running jokes this cast will carry.
function talkState(state) {
  if (state.flags.talk) return state.flags.talk;
  const r = createRng(state.seed * 7717 + 3);
  const rareOff = TALK.filter((t) => t.rare && !chance(r, B.rareExchangeShare)).map((t) => t.id);
  const jokes = {};
  for (const j of shuffle(r, RUNNING_JOKES).slice(0, B.runningJokesPerRun)) jokes[j.id] = { cast: null, step: 0, next: null };
  state.flags.talk = { rareOff, jokes, recent: [], cd: {} };
  return state.flags.talk;
}

// Cast members for one role in an exchange. `a` is the first speaker, when already chosen.
function candidates(state, spec, { a = null, used, context, stream }) {
  const pool = (stream === 'say' ? state.staff.filter(inOffice) : around(state)).filter((p) => !used.has(p.id));
  const mentorOf = (p) => state.staff.find((m) => m.assignment.type === 'mentor' && m.assignment.targetId === p.id && m.mood !== 'away');
  switch (spec) {
    case 'any': return pool;
    case 'founder': return pool.filter((p) => p.founder);
    case 'builder': return pool.filter((p) => p.role === 'engineer' || p.role === 'designer');
    case 'junior': return pool.filter((p) => p.seniority === 'junior');
    case 'senior': return pool.filter((p) => p.seniority === 'senior');
    case 'mentor': return pool.filter((p) => p.assignment.type === 'mentor');
    case 'mentee': return a?.assignment.type === 'mentor' ? pool.filter((p) => p.id === a.assignment.targetId) : [];
    case 'mentorOf': return a ? pool.filter((p) => mentorOf(a)?.id === p.id) : [];
    case 'teammate': return a?.assignment.type === 'project' ? pool.filter((p) => p.assignment.type === 'project' && p.assignment.targetId === a.assignment.targetId) : [];
    case 'neighbour': {
      const at = a ? seatOf(state, a.id) : null;
      if (!at) return [];
      return pool.filter((p) => { const s = seatOf(state, p.id); return s && Math.max(Math.abs(s[0] - at[0]), Math.abs(s[1] - at[1])) <= B.neighbourTiles; });
    }
    case 'newhire': return pool.filter((p) => !p.founder && state.week - p.hiredWeek <= 8);
    case 'veteran': return pool.filter((p) => p.founder || state.week - p.hiredWeek >= 104);
    case 'coasting': return pool.filter((p) => p.mood === 'coasting');
    case 'burnout': return pool.filter((p) => p.mood === 'burnout');
    case 'tired': return pool.filter((p) => p.stamina < B.staminaLowBelow + 10);
    case 'happy': return pool.filter((p) => p.mood === 'ok' && p.meaning >= 60);
    case 'automated': return pool.filter((p) => automationExposure(state, p) > 0.5);
    case 'overseer': return pool.filter((p) => p.assignment.type === 'oversight');
    case 'remote': return pool.filter((p) => p.remote);
    case 'stayer': return pool.filter((p) => p.id === state.lockdown?.stayerId);
    case 'petOwner': return pool.filter((p) => state.pets.some((x) => x.ownerId === p.id));
    case 'promoted': return context?.person ? pool.filter((p) => p.id === context.person.id) : [];
    default: return pool.filter((p) => p.role === spec);
  }
}

// Values for a line's placeholders; null values make a line unusable.
function slotValues(ctx, cast, context) {
  const { state, rng } = ctx;
  const products = live(state);
  const prod = context?.product ?? (products.length ? pick(rng, products) : null);
  const auto = state.automation.engineering;
  const project = cast.a?.assignment.type === 'project' ? state.projects.find((j) => j.id === cast.a.assignment.targetId) : null;
  const items = state.office.placed.filter((p) => p.itemId !== 'desk');
  const others = around(state).filter((p) => !Object.values(cast).some((c) => c && (c.id === p.id || first(c) === first(p))));
  const pet = state.pets[0] ?? null;
  return {
    a: cast.a ? first(cast.a) : null, b: cast.b ? first(cast.b) : null, c: cast.c ? first(cast.c) : null,
    product: prod?.name ?? null,
    category: prod ? CATEGORIES[prod.category].name : null,
    incumbent: incumbentFor(prod?.category ?? state.market.unlockedCategories[0]).name,
    model: prod?.model ? MODELS[prod.model].name : auto.level > 0 ? MODELS[auto.model].name : null,
    project: project?.name ?? null,
    coworker: others.length ? first(pick(rng, others)) : null,
    rival: state.rival && (state.rival.status === 'rising' || state.rival.status === 'stalled') ? state.rival.name : null,
    rivalFounder: state.rival ? state.rival.founderName.split(' ')[0] : null,
    pet: pet?.name ?? null,
    item: context?.item ?? (items.length ? ITEMS[pick(rng, items).itemId].name : null),
    era: currentEra(state).name,
    company: state.companyName,
    gone: context?.gone ?? null,
    year: String(dateOf(state.week).year),
  };
}

function fill(text, values) {
  let missing = false;
  const withArticles = text.replace(/\b([Aa])n? \{(\w+)\}/g, (m, a, key) => {
    const v = values[key];
    if (v === null || v === undefined) return m;
    const phrase = article(v);
    return a === 'A' ? phrase[0].toUpperCase() + phrase.slice(1) : phrase;
  });
  const out = withArticles.replace(/\{(\w+)\}/g, (_, key) => {
    const v = values[key];
    if (v === null || v === undefined) missing = true;
    return v ?? '';
  });
  return missing ? null : out;
}

// A variant for a turn that fits the era and the office and has not been used lately, filled in.
function chooseLine(ctx, variants, values, talk) {
  const fits = variants.filter((v) => eraAllowsText(ctx.state, v) && !talk.recent.includes(v));
  for (const v of shuffle(ctx.rng, fits)) {
    const text = fill(v, values);
    if (text !== null) return { template: v, text };
  }
  return null;
}

// Casts and fills a whole exchange, or returns null if any part cannot be cast or filled.
function plan(ctx, ex, context, talk, fixedCast = null) {
  const { state, rng } = ctx;
  const used = new Set();
  const cast = {};
  for (const [role, spec] of Object.entries(ex.cast)) {
    if (fixedCast) {
      const p = state.staff.find((x) => x.id === fixedCast[role]);
      if (!p || (ex.stream === 'say' ? !inOffice(p) : p.mood === 'away')) return null;
      cast[role] = p;
    } else {
      const options = candidates(state, spec, { a: cast.a ?? null, used, context, stream: ex.stream });
      if (!options.length) return null;
      cast[role] = pick(rng, options);
    }
    used.add(cast[role].id);
  }
  const values = slotValues(ctx, cast, context);
  const lines = [];
  for (const [role, variants] of ex.turns) {
    const line = chooseLine(ctx, variants, values, talk);
    if (!line) return null;
    lines.push({ person: cast[role], ...line });
  }
  return { cast, lines };
}

function remember(talk, lines) {
  talk.recent.push(...lines.map((l) => l.template));
  if (talk.recent.length > B.talkMemory) talk.recent.splice(0, talk.recent.length - B.talkMemory);
}

function emit(ctx, ex, planned) {
  const { state } = ctx;
  if (ex.stream === 'say') {
    let prev = null;
    for (const l of planned.lines) {
      const toId = prev ? prev.staffId : (planned.lines.find((x) => x.person.id !== l.person.id)?.person.id ?? null);
      const e = { type: 'say', id: newId(state, 'v'), week: state.week, staffId: l.person.id, text: l.text, toId, replyTo: prev?.id ?? null };
      ctx.emit(e);
      prev = e;
    }
  } else {
    const kind = ex.channel === 'wins' ? 'win' : ex.channel === 'incidents' ? 'incident' : null;
    const root = emitChat(ctx, { channel: ex.channel, person: planned.lines[0].person, text: planned.lines[0].text, kind, important: !!ex.important });
    for (const l of planned.lines.slice(1)) emitChat(ctx, { channel: ex.channel, person: l.person, text: l.text, replyTo: root.id, kind });
  }
}

// Tries the eligible exchanges in weighted random order until one can be cast and filled.
function runOne(ctx, pool, context, talk) {
  const left = [...pool];
  while (left.length) {
    const ex = weighted(ctx.rng, left, (t) => t.weight ?? 1);
    left.splice(left.indexOf(ex), 1);
    const planned = plan(ctx, ex, context?.[ex.on] ?? null, talk);
    if (!planned) continue;
    emit(ctx, ex, planned);
    remember(talk, planned.lines);
    talk.cd[ex.id] = ctx.state.week + (ex.cooldown ?? B.exchangeCooldownWeeks);
    return planned;
  }
  return null;
}

function eligible(state, talk, h, { stream, on }) {
  return TALK.filter((t) => t.stream === stream
    && (on ? t.on === on : !t.on)
    && (talk.cd[t.id] ?? -1) <= state.week
    && !talk.rareOff.includes(t.id)
    && (!t.eras || t.eras.includes(h.era))
    && (!t.when || t.when(state, h)));
}

// The running joke whose next beat is due, played with the same cast every time.
function runJoke(ctx, stream, talk, h) {
  const { state, rng } = ctx;
  for (const [id, j] of Object.entries(talk.jokes)) {
    const joke = RUNNING_JOKES.find((x) => x.id === id);
    if (!joke || joke.stream !== stream || j.step >= joke.beats.length) continue;
    if (joke.eras && !joke.eras.includes(h.era)) continue;
    if (j.next === null) { j.next = state.week + int(rng, ...B.jokeGapWeeks); continue; }
    if (state.week < j.next) continue;
    const ex = { ...joke, turns: joke.beats[j.step], important: true };
    const planned = plan(ctx, ex, null, talk, j.cast);
    if (!planned) {
      // A cast member left: the joke ends quietly.
      if (j.cast) j.step = joke.beats.length;
      else j.next = state.week + 4;
      continue;
    }
    j.cast ??= Object.fromEntries(Object.entries(planned.cast).map(([k, p]) => [k, p.id]));
    emit(ctx, ex, planned);
    remember(talk, planned.lines);
    j.step++;
    j.next = state.week + int(rng, ...B.jokeGapWeeks);
    return true;
  }
  return false;
}

function soloLine(ctx, talk, h) {
  const { state, rng } = ctx;
  const people = shuffle(rng, state.staff.filter(inOffice));
  for (const p of people.slice(0, 3)) {
    const keys = soloKeys(state, p, h);
    for (const key of keys) {
      const values = slotValues(ctx, { a: p }, null);
      const line = chooseLine(ctx, SAY_SOLO[key] ?? [], values, talk);
      if (!line) continue;
      ctx.emit({ type: 'say', id: newId(state, 'v'), week: state.week, staffId: p.id, text: line.text, toId: null, replyTo: null });
      remember(talk, [line]);
      return true;
    }
  }
  return false;
}

// Which solo pools fit a person right now, most specific first.
function soloKeys(state, p, h) {
  const keys = [];
  if (p.mood === 'burnout') keys.push('burnout');
  if (p.stamina < B.staminaLowBelow + 10) keys.push('tired');
  if (p.mood === 'coasting') keys.push('coasting');
  if (h.beats.outage) keys.push('outage');
  if (p.assignment.type === 'project') keys.push('building');
  keys.push(p.role);
  keys.push('any');
  return keys;
}

// What is going on this week, for situational exchanges: { [situation]: context or null }.
export function situations(ctx, happened) {
  const { state } = ctx;
  const beats = { ...happened };
  const recent = (flag, weeks) => state.flags[flag] !== undefined && state.week - state.flags[flag] <= weeks;
  if (state.outage) beats.outage = { product: state.products.find((p) => p.id === state.outage.productId) ?? null };
  const resigned = ctx.events.find((e) => e.type === 'resign' && !e.fired);
  if (resigned) beats.resign = { gone: resigned.name.split(' ')[0] };
  if (state.staff.some((p) => !p.founder && state.week - p.hiredWeek <= 1)) beats.hire = {};
  if (eraIndex(state) > 0 && state.week - state.era.since <= 3) beats.era = {};
  if (recent('officeMovedWeek', 4)) beats.office = {};
  if (recent('standupChangedWeek', 3)) beats.standups = {};
  if (state.staff.some((p) => p.mood === 'burnout')) beats.burnout = {};
  if (state.cash < 0 || state.lowCashWeeks > 0) beats.lowcash = {};
  if (state.lockdown && state.week < state.lockdown.until) beats.lockdown = {};
  if (state.rival && state.rival.status === 'rising') beats.rival = {};
  if (state.pets.length) beats.pet = {};
  if (ctx.events.some((e) => e.type === 'goal')) beats.goal = {};
  for (const k of Object.keys(beats)) if (!beats[k] || !SITUATIONS.includes(k)) delete beats[k];
  return beats;
}

export function helpersFor(state, beats) {
  return {
    era: currentEra(state).id, avgMeaning: avg(around(state), (p) => p.meaning), debt: state.comprehensionDebt,
    ik: state.institutionalKnowledge, week: state.week, staff: state.staff.length, live: live(state).length,
    cash: state.cash, stage: state.officeStage, policy: state.workPolicy, beats,
    hasModifier: (label) => state.modifiers.some((m) => m.label === label && m.untilWeek > state.week),
  };
}

// The over-notifier @channels the whole company, a few times a run. During a fresh outage the ping is
// warranted and people take back their reaction.
function atChannel(ctx, talk, factor) {
  const { state, rng } = ctx;
  if ((talk.atChannelNext ?? 0) > state.week) return;
  const people = around(state);
  let offender = people.find((p) => p.id === talk.overNotifier);
  if (!offender) {
    const pool = people.filter((p) => !p.founder);
    if (pool.length < 3) return;
    offender = pick(rng, pool);
    talk.overNotifier = offender.id;
  }
  const outage = state.outage && state.outage.weeks <= 1 ? state.products.find((p) => p.id === state.outage.productId) : null;
  const warranted = outage && chance(rng, B.atChannelWarrantedChance);
  if (!warranted && !chance(rng, B.atChannelChance * factor)) return;
  const beat = warranted ? AT_CHANNEL_WARRANTED : pick(rng, AT_CHANNEL);
  const values = { a: first(offender), product: outage?.name ?? '' };
  const text = (t) => t.replace(/\{(a|product)\}/g, (_, k) => values[k]);
  const root = emitChat(ctx, { channel: 'general', person: offender, text: text(pick(rng, beat.post)), important: !!warranted,
    reactions: { no_at_channel: int(rng, 2, 6), ...(warranted ? {} : { '😂': 1 }) } });
  const others = shuffle(rng, people.filter((p) => p.id !== offender.id));
  const replies = shuffle(rng, beat.replies).slice(0, int(rng, 1, 2));
  replies.forEach((r, i) => { if (others[i]) emitChat(ctx, { channel: 'general', person: others[i], text: text(r), replyTo: root.id }); });
  const sigher = state.staff.find((p) => p.id !== offender.id && p.seniority === 'senior' && inOffice(p));
  if (!warranted && sigher && chance(rng, B.atChannelSighChance)) {
    const lines = ['Someone @channeled again.', 'We need to talk about @channel. Again.', 'My phone just told me about a yogurt.'];
    ctx.emit({ type: 'say', id: newId(state, 'v'), week: state.week, staffId: sigher.id, text: pick(rng, lines), toId: null, replyTo: null });
  }
  talk.atChannelNext = state.week + B.atChannelGapWeeks;
}

// One week of office talk: spoken lines (say events) and Yak threads, at a modest rate, with this
// week's situations first, then running jokes, then everyday exchanges and solo lines.
export function talkSystem(ctx, happened) {
  const { state, rng } = ctx;
  if (!around(state).length) return;
  const talk = talkState(state);
  const beats = situations(ctx, happened);
  const h = helpersFor(state, beats);
  const factor = clamp(h.avgMeaning / 70, 0.3, 1.2);
  // Situations in priority order: the most newsworthy thing this week gets talked about first. Ongoing ones
  // (a pet, a rival, a burnout) come up now and then rather than every week.
  const onNow = SITUATIONS.filter((k) => beats[k] && (!ONGOING.has(k) || chance(rng, B.ongoingSituationChance)));

  // Spoken.
  let spoke = false;
  if (chance(rng, B.saySituationChance)) {
    for (const on of onNow) if (!spoke) spoke = !!runOne(ctx, eligible(state, talk, h, { stream: 'say', on }), beats, talk);
  }
  if (!spoke) spoke = runJoke(ctx, 'say', talk, h);
  if (!spoke && chance(rng, B.sayExchangeChance * factor)) spoke = !!runOne(ctx, eligible(state, talk, h, { stream: 'say' }), beats, talk);
  if (!spoke && chance(rng, B.saySoloChance * factor)) soloLine(ctx, talk, h);

  // Yak.
  let posted = false;
  // A new person's own hello already greets the channel; no second welcome thread in the same stretch.
  const greeted = state.flags.helloWeek !== undefined && state.week - state.flags.helloWeek <= 1;
  if (chance(rng, B.chatSituationChance)) {
    for (const on of onNow) if (!posted && !(on === 'hire' && greeted)) posted = !!runOne(ctx, eligible(state, talk, h, { stream: 'chat', on }), beats, talk);
  }
  if (!posted) posted = runJoke(ctx, 'chat', talk, h);
  if (!posted && chance(rng, B.threadChance * factor)) posted = !!runOne(ctx, eligible(state, talk, h, { stream: 'chat' }), beats, talk);
  atChannel(ctx, talk, factor);
  return posted;
}

export { CAST_SPECS };
