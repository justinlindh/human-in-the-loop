import { B } from './balance.js';
import { int, range, pick } from './rng.js';
import { clamp, round, sum, newId, dateOf } from './util.js';
import { registerAction, registerSystem } from './registry.js';
import { STATS, defaultAssignment } from './staff.js';
import { zeroPoints } from './work.js';
import { comboFit } from '../data/combos.js';
import { TRENDS } from '../data/trends.js';
import { PRESS, REVIEW_QUOTES, AI_REVIEW_QUOTES } from '../data/press.js';
import { CATEGORIES } from '../data/categories.js';
import { RESEARCH } from '../data/research.js';
import { ANGLES } from '../data/angles.js';
import { lockedReason } from './unlocks.js';
import { eraAtLeast, eraIndex } from './eras.js';
import { emitChat } from './chat.js';
import { raiseDecision } from './events.js';

const STAT_LABEL = { features: 'Features', polish: 'Polish', reliability: 'Reliability', novelty: 'Freshness' };

export function trendMods(state, category, angle) {
  const t = TRENDS[state.market.trend] ?? TRENDS.steady;
  return (t.angleMods[angle] ?? 1) * (t.categoryMods[category] ?? 1);
}

export const isLive = (p) => !p.killed;
export const liveProducts = (state) => state.products.filter(isLive);
export const findProduct = (state, id) => state.products.find((p) => p.id === id);

// Scores a finished project. Quality is stat points per point of effort (the team's skill mix),
// judged against a bar that rises each year the project started, up to a cap; combo fit and trends add or subtract a flat amount.
// Uses rng for per-outlet noise.
export function reviewScore(state, project) {
  const stats = project.stats;
  const total = sum(STATS, (st) => stats[st]);
  const { yearIndex } = dateOf(project.startedWeek ?? state.week);
  const effort = project.pointsNeeded ?? B.sizes[project.size].points;
  const quality = effort > 0 ? total / effort : 0;
  const bar = 1 + B.expectationGrowth * Math.min(yearIndex, B.expectationYearsCap);
  const fit = comboFit(project.category, project.angle) * trendMods(state, project.category, project.angle);
  const imbalance = total > 0 ? ['features', 'polish', 'reliability'].filter((st) => stats[st] / total < B.balancePenaltyBelow).length : 3;
  const base = clamp(B.reviewBase + B.reviewScale * (quality / bar - 1) + B.fitScoreScale * (fit - 1) - 0.8 * imbalance, 1, 10);
  const reviews = PRESS.map((outlet) => {
    const score = Math.round(clamp(base + range(state.rng, -B.reviewNoise, B.reviewNoise), 1, 10) * 2) / 2;
    const band = score < 5 ? 'low' : score >= 8 ? 'high' : 'mid';
    const quotes = eraIndex(state) > 0 ? [...REVIEW_QUOTES[band], ...AI_REVIEW_QUOTES[band]] : REVIEW_QUOTES[band];
    return { outlet: outlet.name, score, quote: pick(state.rng, quotes) };
  });
  return { score: round(sum(reviews, (r) => r.score) / reviews.length, 1), reviews, base, fit, quality };
}

// Founders built the company, so any founder can build, whatever their role.
const freeBuilders = (state) => state.staff.some((p) => p.mood !== 'away' && (p.role === 'engineer' || p.role === 'designer' || p.founder));

function baseProject(state, fields) {
  return {
    id: newId(state, 'j'), kind: fields.kind, name: fields.name, category: fields.category ?? null, angle: fields.angle ?? null,
    model: fields.model ?? null, size: fields.size ?? 'small', researchId: fields.researchId ?? null, pointsNeeded: fields.pointsNeeded, progress: 0,
    stats: zeroPoints(), productId: fields.productId ?? null, startedWeek: state.week, bankedHype: 0,
  };
}

function validateNew(state, a) {
  const size = B.sizes[a.size];
  if (!size) return 'Unknown size';
  if (!state.market.unlockedCategories.includes(a.category)) return 'Category is locked';
  if (!state.market.unlockedAngles.includes(a.angle)) return 'Angle is locked';
  if (ANGLES[a.angle].ai) {
    const m = state.models[a.model];
    if (!m || !m.available || m.deprecated) return 'Model is not available';
  }
  if (state.officeStage < size.minStage) return 'Needs a bigger office';
  if (state.cash < size.cost) return 'Not enough cash';
  return null;
}

registerAction('startProject', (ctx, a) => {
  const { state } = ctx;
  const { yearIndex } = dateOf(state.week);
  let project;
  if (a.kind === 'new') {
    const reason = validateNew(state, a);
    if (reason) return { ok: false, reason };
    if (!freeBuilders(state)) return { ok: false, reason: 'Nobody is free to build it' };
    const name = String(a.name ?? '').trim().slice(0, 40) || `${CATEGORIES[a.category].name}${ANGLES[a.angle].ai ? ' AI' : 'ly'}`;
    state.cash -= B.sizes[a.size].cost;
    project = baseProject(state, {
      kind: 'new', name, category: a.category, angle: a.angle, model: ANGLES[a.angle].ai ? a.model : null, size: a.size,
      pointsNeeded: B.sizes[a.size].points * (1 + B.pointsGrowthPerYear * yearIndex),
    });
  } else if (a.kind === 'update' || a.kind === 'migration') {
    const pr = findProduct(state, a.productId);
    if (!pr || pr.killed) return { ok: false, reason: 'No such product' };
    if (a.kind === 'migration' && pr.migrationDueWeek === null) return { ok: false, reason: 'No migration needed' };
    if (state.projects.some((j) => j.productId === pr.id && j.kind === a.kind)) return { ok: false, reason: 'Already in progress' };
    if (!freeBuilders(state)) return { ok: false, reason: 'Nobody is free to build it' };
    const isUpdate = a.kind === 'update';
    project = baseProject(state, {
      kind: a.kind, name: isUpdate ? `${pr.name} v${pr.version + 1}` : `${pr.name} migration`,
      category: pr.category, angle: pr.angle, model: isUpdate ? pr.model : (state.flags[`migrateTo_${pr.id}`] ?? pr.model), size: pr.size, productId: pr.id,
      pointsNeeded: (isUpdate ? B.sizes[pr.size].points * B.updatePointsMult : B.migrationPoints) * (1 + B.pointsGrowthPerYear * yearIndex),
    });
  } else if (a.kind === 'refactor' || a.kind === 'craft') {
    if (state.projects.some((j) => j.kind === a.kind)) return { ok: false, reason: 'Already in progress' };
    if (!freeBuilders(state)) return { ok: false, reason: 'Nobody is free to build it' };
    project = baseProject(state, {
      kind: a.kind, name: a.kind === 'refactor' ? 'The Big Refactor' : 'Craft project',
      pointsNeeded: a.kind === 'refactor' ? B.refactorPoints : B.craftPoints,
    });
  } else if (a.kind === 'research') {
    const r = RESEARCH[a.researchId];
    if (!r) return { ok: false, reason: 'Unknown research' };
    const locked = lockedReason(state, 'research');
    if (locked) return { ok: false, reason: locked };
    if (r.ai && !eraAtLeast(state, 'agents')) return { ok: false, reason: 'Arrives with the Agents era' };
    if (state.research.done.includes(r.id)) return { ok: false, reason: 'Already researched' };
    if (r.requires && !state.research.done.includes(r.requires)) return { ok: false, reason: `Requires ${RESEARCH[r.requires].name}` };
    if (state.projects.some((j) => j.researchId === r.id)) return { ok: false, reason: 'Already in progress' };
    if (!freeBuilders(state)) return { ok: false, reason: 'Nobody is free to build it' };
    project = baseProject(state, { kind: 'research', name: r.name, researchId: r.id, pointsNeeded: r.points });
  } else {
    return { ok: false, reason: 'Unknown project kind' };
  }
  state.projects.push(project);
  ctx.emit({ type: 'toast', text: `Started: ${project.name}`, tone: 'info' });
  return { ok: true, projectId: project.id };
});

const shares = (stats) => {
  const total = sum(STATS, (st) => stats[st]);
  return (st) => (total > 0 ? stats[st] / total : 0);
};

function launchNew(ctx, j) {
  const { state } = ctx;
  const review = reviewScore(state, j);
  const share = shares(j.stats);
  const baseHealth = clamp(50 + 150 * share('reliability'), 30, 100);
  const product = {
    id: newId(state, 'p'), name: j.name, category: j.category, angle: j.angle, model: j.model,
    modelVersion: j.model ? state.models[j.model].version : 0, version: 1, size: j.size,
    stats: { ...j.stats }, score: review.score, reviews: review.reviews,
    customers: 0, mrr: 0, hype: clamp(j.bankedHype, 0, 100),
    novelty: clamp(30 * share('novelty') * review.fit, 0, 10),
    health: baseHealth, baseHealth, uptime: 1, launchedWeek: state.week,
    copyAtWeek: state.week + int(state.rng, B.copyDelayWeeks[0], B.copyDelayWeeks[1]),
    copied: false, wrapperHit: false, ownerId: null, migrationDueWeek: null, killed: false,
  };
  state.products.push(product);
  const combo = `${j.category}:${j.angle}`;
  if (!(combo in state.discoveredCombos)) state.discoveredCombos[combo] = round(review.fit, 2);
  for (const c of state.campaigns) if (c.projectId === j.id) { c.projectId = null; c.productId = product.id; }
  state.stats.launches++;
  ctx.emit({ type: 'launch', productId: product.id });
  ctx.emit({ type: 'celebrate', staffId: null });
  ctx.emit({ type: 'toast', text: `${product.name} launched! Reviews average ${product.score}.`, tone: product.score >= 6 ? 'good' : 'warn' });
  return product;
}

function complete(ctx, j) {
  const { state } = ctx;
  const team = state.staff.filter((p) => p.assignment.type === 'project' && p.assignment.targetId === j.id);
  const pr = j.productId ? findProduct(state, j.productId) : null;
  if (j.kind === 'new') {
    launchNew(ctx, j);
    for (const p of team) p.meaning = Math.min(100, p.meaning + B.meaningLaunchBonus);
  } else if (j.kind === 'update' && pr && !pr.killed) {
    for (const st of STATS) pr.stats[st] = pr.stats[st] * 0.6 + j.stats[st];
    const review = reviewScore(state, j);
    const score = round(B.updateOldScoreWeight * pr.score + (1 - B.updateOldScoreWeight) * review.score, 1);
    Object.assign(pr, { score, reviews: review.reviews, version: pr.version + 1, novelty: Math.min(10, pr.novelty + 3), wrapperHit: false });
    ctx.emit({ type: 'launch', productId: pr.id });
    ctx.emit({ type: 'toast', text: `${pr.name} v${pr.version} shipped. Reviews average ${pr.score}.`, tone: 'good' });
    for (const p of team) p.meaning = Math.min(100, p.meaning + B.meaningLaunchBonus);
  } else if (j.kind === 'migration' && pr && !pr.killed) {
    pr.model = j.model;
    pr.modelVersion = j.model ? state.models[j.model].version : 0;
    pr.migrationDueWeek = null;
    delete state.flags[`migrateTo_${pr.id}`];
    ctx.emit({ type: 'toast', text: `${pr.name} migrated. Nothing broke. Probably.`, tone: 'good' });
  } else if (j.kind === 'refactor') {
    state.comprehensionDebt = Math.max(0, state.comprehensionDebt - B.debtPaydownRefactor);
    for (const p of team) p.knowledge = Math.min(100, p.knowledge + 10);
    ctx.emit({ type: 'toast', text: 'The Big Refactor is done. People understand things again.', tone: 'good' });
  } else if (j.kind === 'research' && RESEARCH[j.researchId] && !state.research.done.includes(j.researchId)) {
    const r = RESEARCH[j.researchId];
    state.research.done.push(r.id);
    (ctx.happenings ??= {}).research = true;
    ctx.emit({ type: 'toast', text: `${r.name} is live. ${r.desc}`, tone: 'good' });
    emitChat(ctx, { channel: 'wins', person: team[0] ?? null, from: team[0]?.name ?? '@buildbot', text: `${r.name} shipped. Internal tools are the best tools.` });
  } else if (j.kind === 'craft') {
    for (const p of team) p.meaning = Math.min(100, p.meaning + 15);
    state.brand = Math.min(100, state.brand + 1);
    ctx.emit({ type: 'toast', text: 'The craft project shipped. It is small and perfect.', tone: 'good' });
  }
  for (const p of team) {
    p.assignment = defaultAssignment(p);
    ctx.emit({ type: 'celebrate', staffId: p.id });
  }
  state.projects = state.projects.filter((x) => x.id !== j.id);
}

export function projectsSystem(ctx) {
  const { state } = ctx;
  const reviews = !!state.policies.comprehension_reviews;
  const speed = reviews ? B.comprehensionReviewSpeed : 1;
  for (const j of [...state.projects]) {
    const effort = ctx.weekEffort?.[j.id] ?? zeroPoints();
    const gained = ctx.weekStats?.[j.id] ?? zeroPoints();
    const step = sum(STATS, (st) => effort[st]) * speed;
    // The final week only counts the effort needed to finish, so overshoot cannot inflate quality.
    const f = step > 0 ? Math.min(1, (j.pointsNeeded - j.progress) / step) : 0;
    for (const st of STATS) {
      const bonus = reviews && st === 'reliability' ? 1 + B.reviewsReliabilityBonus : 1;
      j.stats[st] += gained[st] * speed * f * bonus;
    }
    j.progress = Math.min(j.pointsNeeded, j.progress + step * f);
    const top = [...(ctx.contributors?.[j.id] ?? [])]
      .sort((a, b) => sum(STATS, (st) => b.pts[st]) - sum(STATS, (st) => a.pts[st])).slice(0, 3);
    for (const c of top) {
      const best = STATS.reduce((m, st) => (c.pts[st] > c.pts[m] ? st : m), 'features');
      const n = Math.round(c.pts[best]);
      if (n > 0) ctx.emit({ type: 'bubble', staffId: c.staffId, text: `+${n} ${STAT_LABEL[best]}`, tone: best });
    }
    if (j.progress >= j.pointsNeeded) complete(ctx, j);
    else openingBeats(ctx, j);
  }
}

export const OPENING_BEATS = [
  { at: 0.25, toast: '{project}: the prototype runs. As long as nobody clicks the second button.', say: ['It works! Do not touch it.', 'Prototype is up. It is ugly and I love it.', 'First end-to-end run. Only one thing caught fire.'] },
  { at: 0.5, decision: 'first_user_test' },
  { at: 0.75, toast: '{project} is three-quarters done. Someone has started a launch playlist.', say: ['I can see the finish line. It is blurry, but I can see it.', 'We should pick a launch date. A real one.', 'I rewrote the landing page again. Last time. Probably.'] },
];

// Small moments during the very first product, so the opening build is never silent.
function openingBeats(ctx, j) {
  const { state } = ctx;
  if (j.kind !== 'new' || state.stats.launches > 0) return;
  const done = state.flags.openingBeats ?? 0;
  const beat = OPENING_BEATS[done];
  if (!beat || j.progress / j.pointsNeeded < beat.at) return;
  state.flags.openingBeats = done + 1;
  if (beat.decision) { raiseDecision(ctx, beat.decision, null, { queue: true }); return; }
  ctx.emit({ type: 'toast', text: beat.toast.replace('{project}', j.name), tone: 'good' });
  const team = state.staff.filter((p) => p.assignment.type === 'project' && p.assignment.targetId === j.id);
  const speaker = team.find((p) => p.founder) ?? team[0];
  if (speaker) ctx.emit({ type: 'say', id: newId(state, 'v'), week: state.week, staffId: speaker.id, text: beat.say[state.week % beat.say.length], toId: null, replyTo: null });
}

registerSystem('projects', projectsSystem, 30);
