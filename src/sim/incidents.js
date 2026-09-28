import { ensureRecord } from './record.js';
import { B } from './balance.js';
import { chance, int, next, pick } from './rng.js';
import { avg, clamp, dateOf, sum } from './util.js';
import { registerAction, registerSystem } from './registry.js';
import { outputMult, staffMods } from './staff.js';
import { oversightRequired, oversightProvided, overseers } from './automation.js';
import { liveProducts } from './projects.js';
import { totalMrr } from './products.js';
import { emitChat } from './chat.js';
import { raiseDecision } from './events.js';
import { FUNCTIONS } from './state.js';
import { MODELS } from '../data/models.js';
import { CHATTER } from '../data/chatter.js';
import { INCIDENT_EVENT } from '../data/events.js';
import { modifierBonus } from './modifiers.js';
import { fillChat } from './chat.js';
import { researchBonus } from './bonus.js';
import { eraAtLeast, eraLines } from './eras.js';
import { lockedReason } from './unlocks.js';
import { bumpDebt } from './debt.js';
export { responding } from './responders.js';

const ROGUE_KINDS = {
  engineering: ['db_wipe', 'runaway_spend'], support: ['refund_hallucination'], sales: ['pricing_rewrite'],
  marketing: ['mass_email'], qa: ['prompt_injection_leak'], ops: ['prompt_injection_leak'],
};
const CYBER_KINDS = ['credential_stuffing', 'ransomware', 'supply_chain', 'data_exfiltration', 'phishing'];

// Incident kinds that can take a product down; stolen data and phished money hurt cash and trust instead.
export const OUTAGE_KINDS = new Set(['db_wipe', 'runaway_spend', 'refund_hallucination', 'pricing_rewrite', 'mass_email', 'prompt_injection_leak', 'ransomware', 'supply_chain']);
const KIND_LABEL = {
  db_wipe: 'agent wiped a database', runaway_spend: 'agent runaway cloud spend', refund_hallucination: 'support bot promised refunds',
  pricing_rewrite: 'agent rewrote pricing', mass_email: 'agent emailed every customer', prompt_injection_leak: 'agent leaked config via prompt injection',
  credential_stuffing: 'credential stuffing', ransomware: 'ransomware', supply_chain: 'supply chain compromise',
  data_exfiltration: 'data exfiltration', phishing: 'CEO phishing',
};

const onSecurity = (state) => state.staff.filter((p) => p.mood !== 'away' && p.assignment.type === 'security');

// Security posture broken into the pieces the Ops panel shows; total is securityPosture.
export function postureParts(state) {
  const staff = sum(onSecurity(state), (p) => avg(Object.values(p.skills)) * B.postureSecurityPerSkill * outputMult(state, p) / 10);
  const bonus = researchBonus(state, 'postureFlat') + sum(state.staff.filter((p) => p.mood !== 'away'), (p) => staffMods(p).postureFlat);
  const audit = state.security.auditBoost;
  const tooling = state.security.tooling ? B.postureTooling : 0;
  const debt = state.comprehensionDebt * B.postureDebtPenalty;
  return { people: onSecurity(state).length, staff, bonus, audit, tooling, debt, total: clamp(staff + bonus + audit + tooling - debt, 0, 100) };
}

export const securityPosture = (state) => postureParts(state).total;

function shortfall(state) {
  const req = oversightRequired(state);
  return req > 0 ? clamp(1 - oversightProvided(state) / req, 0, 1) : 0;
}

export function rogueRisk(state, fn) {
  const a = state.automation[fn];
  if (a.level <= 0 || !eraAtLeast(state, 'agents')) return 0;
  return B.rogueBase * a.level * (1 - MODELS[a.model].guardrails) * (B.rogueShortfallFloor + shortfall(state))
    * (1 + state.comprehensionDebt / 50) * Math.max(0, 1 + modifierBonus(state, 'rogueRisk') + researchBonus(state, 'rogueRisk'));
}

export function catchChance(state) {
  const req = oversightRequired(state);
  const coverage = req > 0 ? Math.min(1, oversightProvided(state) / req) : 1;
  const eyes = overseers(state);
  if (!eyes.length) return 0;
  const bonus = Math.max(0, ...eyes.map((p) => staffMods(p).catch));
  return Math.min(B.catchMax, B.catchBase * coverage + bonus);
}

// Attackers find a company once it has been around for a while: no attacks in the first months after the first launch.
export function cyberChance(state) {
  const mrr = totalMrr(state);
  const firstLaunch = Math.min(...state.products.map((p) => p.launchedWeek));
  if (!(mrr > 0) || state.week - firstLaunch < B.cyberGraceWeeks) return 0;
  return Math.min(B.cyberMax, B.cyberBase + B.cyberPerMrr * mrr);
}

// Engineers can debug; founders built the thing and can debug it whatever their role, and do it better.
// Everyone present who can debug, best first, with how much they bring to a fix.
export function fixRanking(state) {
  return state.staff.filter((p) => p.mood !== 'away' && (p.role === 'engineer' || p.founder))
    .map((p) => ({ id: p.id, power: (p.knowledge / 100) * B.seniorityOutput[p.seniority] * (p.founder ? B.founderFixMult : 1) }))
    .sort((a, b) => b.power - a.power);
}

const remoteShare = (state) => (state.staff.length ? state.staff.filter((p) => p.remote).length / state.staff.length : 0);
const commanderOf = (state) => state.staff.filter((p) => p.mood !== 'away' && staffMods(p).outageFix > 1)
  .reduce((a, b) => (!a || staffMods(b).outageFix > staffMods(a).outageFix ? b : a), null);

export function fixCapacity(state) {
  const lead = commanderOf(state);
  const commander = lead ? staffMods(lead).outageFix : 1;
  // Debugging does not parallelize: only the few who best understand the systems count.
  const fixers = fixRanking(state).slice(0, B.fixersCounted).map((x) => x.power);
  return sum(fixers) * commander * (1 + researchBonus(state, 'outageFix')) * (1 - B.remoteFixPenalty * remoteShare(state));
}

const responderIds = (state) => fixRanking(state).slice(0, B.fixersCounted).map((x) => x.id);
const weeksToFix = (state, severity) => Math.max(1, Math.ceil(severity / Math.max(fixCapacity(state), 0.1)));

// How much harder tech debt makes a fix, against a clean codebase.
const debtFixMult = (state) => (40 + state.comprehensionDebt) / 40;

// More live products means more tangled systems to understand when something breaks.
const isUnrecoverable = (state, severity) => fixCapacity(state)
  < severity * (0.4 + state.comprehensionDebt / 100) * Math.max(0, 1 + researchBonus(state, 'unrecoverableThreshold'))
    * (1 + B.outageComplexityPerProduct * liveProducts(state).length);

export function startOutage(ctx, { productId, kind, severity, cost = { cash: 0, brand: 0 }, cause = '', notes = null }) {
  const { state } = ctx;
  state.flags.outageSeq = (state.flags.outageSeq ?? 0) + 1;
  state.outage = { productId, kind, severity, weeks: 0, unrecoverable: isUnrecoverable(state, severity),
    responderIds: responderIds(state), etaWeeks: null, cost: { cash: cost.cash, brand: cost.brand, customers: 0 }, cause };
  state.outage.etaWeeks = state.outage.unrecoverable ? null : weeksToFix(state, severity);
  state.flags.outageNotes = notes ?? { helped: [], hurt: [] };
  const p = state.products.find((x) => x.id === productId);
  noteWorstOutage(state, p);
  state.flags.outageRescueAsked = false;
  ctx.emit({ type: 'toast', text: `${p?.name ?? 'A product'} is down.${state.outage.unrecoverable ? ' Nobody knows how to fix it.' : ''}`, tone: 'bad' });
  askForRescue(ctx);
}

// Once per outage, when nobody on staff can fix it, ask the player how to get it fixed.
function askForRescue(ctx) {
  const { state } = ctx;
  if (!state.outage?.unrecoverable || state.flags.outageRescueAsked) return;
  state.flags.outageRescueAsked = true;
  raiseDecision(ctx, 'outage_unfixable', state.outage.productId, { queue: true });
}

const RESCUE_LINE = {
  ' thanks to very expensive consultants': `Consultants fixed it for $${Math.round(B.consultantCost / 1000)}k`,
  ' thanks to the contractor': 'An emergency contractor patched it',
};

export function clearOutage(ctx, how) {
  const { state } = ctx;
  const o = state.outage;
  if (!o) return;
  const p = state.products.find((x) => x.id === o.productId);
  const notes = state.flags.outageNotes ?? { helped: [], hurt: [] };
  const helped = [...notes.helped];
  const hurt = [...notes.hurt];
  if (RESCUE_LINE[how]) helped.push(RESCUE_LINE[how]);
  if (state.flags.outageRescueAsked) hurt.push('Nobody on staff knew how to fix it');
  state.outage = null;
  delete state.flags.outageNotes;
  const engineers = state.staff.filter((x) => x.role === 'engineer');
  if (state.policies.blameless) {
    for (const e of engineers) e.knowledge = Math.min(100, e.knowledge + B.blamelessKnowledge);
    helped.push('Blameless culture: every engineer learned from it');
  } else for (const e of engineers) e.meaning = Math.max(0, e.meaning - 5);
  ctx.emit({ type: 'toast', text: `${p?.name ?? 'The product'} is back up${how}.`, tone: 'good' });
  resolveIncident(ctx, { productId: o.productId, kind: o.kind, severity: o.severity, weeks: o.weeks, cost: o.cost ?? { cash: 0, brand: 0, customers: 0 },
    responderIds: o.responderIds ?? [], helped: [...fixHelped(state, o.responderIds ?? []), ...helped], hurt: [...fixHurt(state), ...hurt] });
}

const firstName = (p) => p.name.split(' ')[0];
const pct = (x) => Math.round(x * 100);

// What made the fix go better, read off the company as it stands at the all-clear.
function fixHelped(state, ids) {
  const out = [];
  const lead = state.staff.find((p) => p.id === ids[0]);
  if (lead) out.push(`${firstName(lead)} knew the systems best`);
  const commander = commanderOf(state);
  if (commander) out.push(`${firstName(commander)} ran the incident`);
  const research = researchBonus(state, 'outageFix');
  if (research > 0) out.push(`Research made fixing ${pct(research)}% faster`);
  return out;
}

// What made the fix go worse.
function fixHurt(state) {
  const out = [];
  const mult = Math.round(debtFixMult(state) * 10) / 10;
  if (mult >= B.incidentDebtLineMult) out.push(`Tech debt ${Math.round(state.comprehensionDebt)} made this ${mult.toFixed(1)}x harder to fix`);
  const n = liveProducts(state).length;
  if (n >= B.incidentSprawlLine) out.push(`${n} live products made the systems harder to untangle`);
  const remote = B.remoteFixPenalty * remoteShare(state);
  if (remote >= 0.05) out.push(`Remote work made fixing ${pct(remote)}% slower`);
  return out;
}

// The incident is over: say what it cost and what helped, and open the postmortem for a severe one.
// A rogue agent's SEV decision waits for this; an attack had its decision at the alarm and gets a short follow-up.
function resolveIncident(ctx, r) {
  const { state } = ctx;
  const cost = { cash: Math.round(r.cost.cash), brand: Math.round(r.cost.brand * 10) / 10, customers: r.cost.customers };
  const event = { type: 'incidentResolved', productId: r.productId, kind: r.kind, severity: r.severity, weeks: r.weeks,
    cost, responderIds: [...r.responderIds], helped: r.helped, hurt: r.hurt };
  ctx.emit(event);
  state.flags.lastIncident = { week: state.week, kind: r.kind, productId: r.productId, severity: r.severity, weeks: r.weeks, cost, responderIds: [...r.responderIds] };
  if (r.severity >= 4) raiseDecision(ctx, CYBER_KINDS.includes(r.kind) ? 'incident_postmortem' : INCIDENT_EVENT[r.kind], r.productId, { queue: true });
}

function noteWorstOutage(state, product) {
  if (!state.outage?.unrecoverable) return;
  state.flags.worstOutageYear = dateOf(state.week).yearIndex;
  state.flags.worstOutageProduct = product?.name ?? null;
}

function outageStep(ctx) {
  const { state } = ctx;
  const o = state.outage;
  if (!o) return;
  if (!state.products.some((p) => p.id === o.productId && !p.killed)) { state.outage = null; return; }
  o.weeks++;
  o.unrecoverable = isUnrecoverable(state, o.severity);
  o.responderIds = responderIds(state);
  noteWorstOutage(state, state.products.find((p) => p.id === o.productId));
  askForRescue(ctx);
  const need = weeksToFix(state, o.severity);
  o.etaWeeks = o.unrecoverable ? null : Math.max(0, need - o.weeks);
  if (!o.unrecoverable && o.weeks >= need) clearOutage(ctx, '');
}

const coverage = (state) => { const req = oversightRequired(state); return req > 0 ? Math.min(1, oversightProvided(state) / req) : 1; };

// The automated function that can make this kind of incident, preferring one that is switched on.
const rogueFunction = (state, kind) => FUNCTIONS.find((fn) => ROGUE_KINDS[fn]?.includes(kind) && state.automation[fn].level > 0)
  ?? FUNCTIONS.find((fn) => ROGUE_KINDS[fn]?.includes(kind));

// Why it happened, in plain words, plus the lines the resolution card lists as having helped or hurt.
function explain(state, kind, model, fn) {
  const helped = [];
  const hurt = [];
  if (!model) {
    const posture = Math.round(securityPosture(state));
    hurt.push(`A security posture of ${posture} let it through`);
    return { cause: `${KIND_LABEL[kind]} got past a security posture of ${posture}`, helped, hurt };
  }
  const agent = fn ?? rogueFunction(state, kind);
  const level = state.automation[agent]?.level ?? 0;
  const cov = pct(coverage(state));
  if (cov < 100) hurt.push(`Oversight covered ${cov}% of what the agents needed`);
  const sandbox = researchBonus(state, 'rogueDamage');
  if (sandbox < 0) helped.push(`The sandbox kept the damage ${pct(-sandbox)}% smaller`);
  return { cause: `the ${agent} agent at level ${level} ran with oversight covering ${cov}% of what it needed`, helped, hurt };
}

// A chat line from a pool with its placeholders filled; falls back to a line that needs none.
function filledLine(ctx, pool, speaker, product) {
  for (let i = 0; i < 6; i++) {
    const text = fillChat(ctx.state, ctx.rng, pick(ctx.rng, eraLines(ctx.state, pool)), { speaker, product });
    if (text !== null) return text;
  }
  return pick(ctx.rng, eraLines(ctx.state, pool).filter((l) => !l.includes('{'))) ?? 'On it.';
}

export function landIncident(ctx, { kind, severity, caught, model, fn = null }) {
  const { state } = ctx;
  const live = liveProducts(state);
  const product = live.length ? pick(ctx.rng, live) : null;
  const productId = product?.id ?? null;
  const sandbox = model ? Math.max(0, 1 + researchBonus(state, 'rogueDamage')) : 1;
  const mult = (caught ? B.caughtDamageMult : 1) * sandbox;
  const cashHit = severity * B.incidentCashPerSeverity * (1 + B.incidentCashYearGrowth * dateOf(state.week).yearIndex) * mult;
  const brandBefore = state.brand;
  state.cash -= cashHit;
  state.brand = clamp(state.brand - severity * mult, 0, 100);
  const cost = { cash: cashHit, brand: brandBefore - state.brand };
  state.flags.lastIncidentModel = model;
  state.stats.incidents++;
  if (caught) state.stats.caught++;
  state.incidentLog.push({ week: state.week, kind, productId, caught, severity });
  if (state.incidentLog.length > 30) state.incidentLog.splice(0, state.incidentLog.length - 30);

  ctx.emit({ type: 'incident', kind, productId, caught, severity });
  const where = product ? ` on ${product.name}` : '';
  emitChat(ctx, { channel: 'incidents', from: '@pagerbot', text: caught ? `SEV${6 - severity} caught early${where}: ${KIND_LABEL[kind]}. Crisis averted.` : `SEV${6 - severity}${where}: ${KIND_LABEL[kind]}.` });
  const witnesses = state.staff.filter((p) => p.mood !== 'away');
  if (caught) {
    const eyes = overseers(state);
    for (const p of eyes) {
      p.meaning = Math.min(100, p.meaning + B.meaningCatchBonus);
      ensureRecord(p);
      p.record.incidentsCaught++;
      p.record.catches++;
    }
    const best = eyes.reduce((a, b) => (staffMods(b).catch + b.skills.reliability > staffMods(a).catch + a.skills.reliability ? b : a));
    ctx.emit({ type: 'celebrate', staffId: best.id });
    emitChat(ctx, { channel: 'incidents', person: best, text: filledLine(ctx, CHATTER.overseer, best, product) });
    return;
  }
  if (witnesses.length) {
    const who = pick(ctx.rng, witnesses);
    emitChat(ctx, { channel: 'incidents', person: who, text: filledLine(ctx, CHATTER.incident, who, product) });
  }
  // An attack's decision responds to the attack itself, so it comes at the alarm.
  if (severity >= 4 && !model) raiseDecision(ctx, INCIDENT_EVENT[kind], productId, { queue: true });
  const why = explain(state, kind, model, fn);
  if (severity >= B.outageMinSeverity && OUTAGE_KINDS.has(kind) && !state.outage && product) {
    startOutage(ctx, { productId, kind, severity, cost, cause: why.cause, notes: { helped: why.helped, hurt: why.hurt } });
  } else if (severity >= 4) {
    resolveIncident(ctx, { productId, kind, severity, weeks: 0, cost: { ...cost, customers: 0 }, responderIds: responderIds(state), helped: why.helped, hurt: why.hurt });
  }
}

// "Write it up properly": the last incident's responders spend another week on it, learn from it,
// and pay tech debt down. Without Blameless Postmortems the write-up stings a little.
export function writePostmortem(state) {
  const ids = state.flags.lastIncident?.responderIds ?? [];
  const people = ids.map((id) => state.staff.find((p) => p.id === id)).filter(Boolean);
  bumpDebt(state, -B.postmortemDebt);
  for (const p of people) {
    p.knowledge = Math.min(100, p.knowledge + B.postmortemKnowledge);
    if (!state.policies.blameless) p.meaning = Math.max(0, p.meaning - B.postmortemMeaning);
  }
  state.flags.postmortem = { staffIds: people.map((p) => p.id), untilWeek: state.week + B.postmortemWeeks };
}

export function incidentsSystem(ctx) {
  const { state } = ctx;
  outageStep(ctx);

  for (const fn of FUNCTIONS) {
    const risk = rogueRisk(state, fn);
    if (risk <= 0 || !chance(ctx.rng, risk)) continue;
    const kind = pick(ctx.rng, ROGUE_KINDS[fn]);
    const severity = Math.min(5, int(ctx.rng, 1, 5) + (state.comprehensionDebt > 60 ? 1 : 0));
    landIncident(ctx, { kind, severity, caught: chance(ctx.rng, catchChance(state)), model: state.automation[fn].model, fn });
  }

  if (chance(ctx.rng, cyberChance(state))) {
    const kind = pick(ctx.rng, CYBER_KINDS);
    if (next(ctx.rng) * 100 > securityPosture(state)) {
      state.stats.breaches++;
      landIncident(ctx, { kind, severity: int(ctx.rng, 1, 5), caught: false, model: null });
    } else {
      ctx.emit({ type: 'toast', text: `Security blocked a ${KIND_LABEL[kind]} attempt.`, tone: 'good' });
      // Everyone on a security assignment gets credit for the attack they stopped.
      for (const p of state.staff) if (p.assignment.type === 'security' && p.mood !== 'away') ensureRecord(p).incidentsCaught++;
    }
  }

  state.security.auditBoost = Math.max(0, state.security.auditBoost - B.postureAuditDecay);
}

registerSystem('incidents', incidentsSystem, 65);

registerAction('buyAudit', (ctx) => {
  const { state } = ctx;
  const locked = lockedReason(state, 'ops');
  if (locked) return { ok: false, reason: locked };
  if (state.cash < B.auditCost) return { ok: false, reason: 'Not enough cash' };
  state.cash -= B.auditCost;
  state.security.auditBoost = B.postureAudit;
  ctx.emit({ type: 'toast', text: 'Security audit booked. The auditors brought their own coffee.', tone: 'info' });
  return { ok: true };
});

registerAction('setTooling', (ctx, { on }) => {
  const locked = on ? lockedReason(ctx.state, 'ops') : null;
  if (locked) return { ok: false, reason: locked };
  ctx.state.security.tooling = !!on;
  return { ok: true };
});

registerAction('callConsultants', (ctx) => {
  const { state } = ctx;
  if (!state.outage) return { ok: false, reason: 'No outage to fix' };
  if (state.cash < B.consultantCost) return { ok: false, reason: 'Not enough cash' };
  state.cash -= B.consultantCost;
  clearOutage(ctx, ' thanks to very expensive consultants');
  return { ok: true };
});
