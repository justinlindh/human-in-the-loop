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
import { researchBonus } from './bonus.js';

const ROGUE_KINDS = {
  engineering: ['db_wipe', 'runaway_spend'], support: ['refund_hallucination'], sales: ['pricing_rewrite'],
  marketing: ['mass_email'], qa: ['prompt_injection_leak'], ops: ['prompt_injection_leak'],
};
const CYBER_KINDS = ['credential_stuffing', 'ransomware', 'supply_chain', 'data_exfiltration', 'phishing'];
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
  return { staff, bonus, audit, tooling, debt, total: clamp(staff + bonus + audit + tooling - debt, 0, 100) };
}

export const securityPosture = (state) => postureParts(state).total;

function shortfall(state) {
  const req = oversightRequired(state);
  return req > 0 ? clamp(1 - oversightProvided(state) / req, 0, 1) : 0;
}

export function rogueRisk(state, fn) {
  const a = state.automation[fn];
  if (a.level <= 0) return 0;
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

export const cyberChance = (state) => Math.min(B.cyberMax, B.cyberBase + B.cyberPerMrr * totalMrr(state));

export function fixCapacity(state) {
  const present = state.staff.filter((p) => p.mood !== 'away');
  const commander = Math.max(1, ...present.map((p) => staffMods(p).outageFix));
  // Engineers can debug; founders built the thing and can debug it whatever their role, and do it better.
  const fixers = present.filter((p) => p.role === 'engineer' || p.founder);
  return sum(fixers, (p) => (p.knowledge / 100) * B.seniorityOutput[p.seniority] * (p.founder ? B.founderFixMult : 1))
    * commander * (1 + researchBonus(state, 'outageFix'));
}

const isUnrecoverable = (state, severity) => fixCapacity(state)
  < severity * (0.4 + state.comprehensionDebt / 100) * Math.max(0, 1 + researchBonus(state, 'unrecoverableThreshold'));

export function startOutage(ctx, { productId, kind, severity }) {
  const { state } = ctx;
  state.outage = { productId, kind, severity, weeks: 0, unrecoverable: isUnrecoverable(state, severity) };
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

export function clearOutage(ctx, how) {
  const { state } = ctx;
  if (!state.outage) return;
  const p = state.products.find((x) => x.id === state.outage.productId);
  state.outage = null;
  const engineers = state.staff.filter((x) => x.role === 'engineer');
  if (state.policies.blameless) for (const e of engineers) e.knowledge = Math.min(100, e.knowledge + 5);
  else for (const e of engineers) e.meaning = Math.max(0, e.meaning - 5);
  ctx.emit({ type: 'toast', text: `${p?.name ?? 'The product'} is back up${how}.`, tone: 'good' });
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
  noteWorstOutage(state, state.products.find((p) => p.id === o.productId));
  askForRescue(ctx);
  if (!o.unrecoverable && o.weeks >= Math.max(1, Math.ceil(o.severity / Math.max(fixCapacity(state), 0.1)))) clearOutage(ctx, '');
}

function incident(ctx, { kind, severity, caught, model }) {
  const { state } = ctx;
  const live = liveProducts(state);
  const product = live.length ? pick(ctx.rng, live) : null;
  const productId = product?.id ?? null;
  const sandbox = model ? Math.max(0, 1 + researchBonus(state, 'rogueDamage')) : 1;
  const mult = (caught ? B.caughtDamageMult : 1) * sandbox;
  state.cash -= severity * B.incidentCashPerSeverity * (1 + B.incidentCashYearGrowth * dateOf(state.week).yearIndex) * mult;
  state.brand = clamp(state.brand - severity * mult, 0, 100);
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
      p.record ??= { mentorWeeks: 0, catches: 0, hardProblemWeeks: 0 };
      p.record.catches++;
    }
    const best = eyes.reduce((a, b) => (staffMods(b).catch + b.skills.reliability > staffMods(a).catch + a.skills.reliability ? b : a));
    ctx.emit({ type: 'celebrate', staffId: best.id });
    emitChat(ctx, { channel: 'incidents', person: best, text: pick(ctx.rng, CHATTER.overseer) });
    return;
  }
  if (witnesses.length) emitChat(ctx, { channel: 'incidents', person: pick(ctx.rng, witnesses), text: pick(ctx.rng, CHATTER.incident) });
  if (severity >= 4) raiseDecision(ctx, INCIDENT_EVENT[kind], productId, { queue: true });
  if (severity >= B.outageMinSeverity && !state.outage && product) startOutage(ctx, { productId, kind, severity });
}

export function incidentsSystem(ctx) {
  const { state } = ctx;
  outageStep(ctx);

  for (const fn of FUNCTIONS) {
    const risk = rogueRisk(state, fn);
    if (risk <= 0 || !chance(ctx.rng, risk)) continue;
    const kind = pick(ctx.rng, ROGUE_KINDS[fn]);
    const severity = Math.min(5, int(ctx.rng, 1, 5) + (state.comprehensionDebt > 60 ? 1 : 0));
    incident(ctx, { kind, severity, caught: chance(ctx.rng, catchChance(state)), model: state.automation[fn].model });
  }

  if (chance(ctx.rng, cyberChance(state))) {
    const kind = pick(ctx.rng, CYBER_KINDS);
    if (next(ctx.rng) * 100 > securityPosture(state)) {
      state.stats.breaches++;
      incident(ctx, { kind, severity: int(ctx.rng, 1, 5), caught: false, model: null });
    } else {
      ctx.emit({ type: 'toast', text: `Security blocked a ${KIND_LABEL[kind]} attempt.`, tone: 'good' });
    }
  }

  state.security.auditBoost = Math.max(0, state.security.auditBoost - B.postureAuditDecay);
}

registerSystem('incidents', incidentsSystem, 65);

registerAction('buyAudit', (ctx) => {
  const { state } = ctx;
  if (state.cash < B.auditCost) return { ok: false, reason: 'Not enough cash' };
  state.cash -= B.auditCost;
  state.security.auditBoost = B.postureAudit;
  ctx.emit({ type: 'toast', text: 'Security audit booked. The auditors brought their own coffee.', tone: 'info' });
  return { ok: true };
});

registerAction('setTooling', (ctx, { on }) => {
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
