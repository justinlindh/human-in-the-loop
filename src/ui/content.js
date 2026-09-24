// Display content for the UI. Prefers the sim lane's src/data modules and src/sim/balance.js
// when they exist; otherwise falls back to local copies of the plan's tables so the UI runs
// against the mock sim on its own.

const dataMods = import.meta.glob('../data/*.js', { eager: true });
const balanceMods = import.meta.glob('../sim/balance.js', { eager: true });
const simMods = import.meta.glob('../sim/index.js', { eager: true });

const DATA = Object.assign({}, ...Object.values(dataMods));
const BAL = Object.values(balanceMods)[0]?.B ?? null;
export const SIM = Object.values(simMods)[0] ?? null;

const byId = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
const asList = (v) => (Array.isArray(v) ? v : v ? Object.values(v) : null);

const FB_CATEGORIES = [
  ['notes', 'Notes', 180000, 12, 2026, false, '📝'], ['email', 'Email', 220000, 10, 2026, false, '✉️'],
  ['pm', 'Project Management', 120000, 25, 2026, false, '📋'], ['support', 'Support Desk', 60000, 60, 2026, false, '🎧'],
  ['crm', 'CRM', 80000, 70, 2027, false, '🤝'], ['analytics', 'Analytics', 70000, 55, 2027, false, '📈'],
  ['design', 'Design Tools', 90000, 30, 2028, false, '🎨'], ['devtools', 'Dev Tools', 100000, 35, 2028, false, '🛠️'],
  ['hr', 'HR', 40000, 90, 2029, true, '🪪'], ['recruiting', 'Recruiting', 35000, 110, 2029, true, '🔎'],
  ['accounting', 'Accounting', 50000, 95, 2030, true, '🧮'], ['video', 'Video Editing', 110000, 28, 2030, false, '🎬'],
  ['legal', 'Legal', 20000, 250, 2031, true, '⚖️'], ['security', 'Security', 30000, 180, 2032, true, '🛡️'],
].map(([id, name, tam, price, unlockYear, compliance, icon]) => ({ id, name, tam, price, unlockYear, compliance, icon }));

const FB_ANGLES = [
  ['copilot', 'Copilot', 2026, false, 'Sits beside you. Suggests things. Mostly helpful.'],
  ['summarizer', 'Summarizer', 2026, false, 'Reads it so you do not have to.'],
  ['workflow', 'Workflow Automation', 2026, true, 'If this, then that, then a surprise.'],
  ['agent', 'Autonomous Agent', 2027, true, 'Does the job. Occasionally a different job.'],
  ['native', 'AI-native Rebuild', 2027, false, 'The same app, reimagined from a blank prompt.'],
  ['voice', 'Voice-first', 2028, false, 'Talk to your software. It talks back.'],
  ['vertical', 'Vertical Fine-tune', 2029, false, 'Knows one industry deeply and nothing else.'],
].map(([id, name, unlockYear, agentic, blurb]) => ({ id, name, unlockYear, agentic, blurb }));

const FB_MODELS = [
  ['claudius', 'Claudius', 80, 2.4, 1500, 0.9, 0.8, true, false, 2026, '#d97757', 'Careful and articulate. Will politely decline to delete prod.'],
  ['chatgbt', 'ChatGBT', 78, 2.0, 1300, 0.7, 0.9, true, false, 2026, '#10a37f', 'Everyone has heard of it. Customers trust the name.'],
  ['gemenai', 'Gemenai', 74, 1.3, 900, 0.65, 0.7, true, false, 2026, '#4b8bf5', 'Reads your whole codebase at once. Sometimes gets creative.'],
  ['grokk', 'Grokk', 70, 1.0, 700, 0.25, 0.35, false, false, 2026, '#8a8a8a', 'Cheap and fast. Has opinions about your customers.'],
  ['llamarama', 'Llamarama', 66, 0.6, 600, 0.45, 0.55, true, true, 2026, '#6b5bd6', 'Open weights. You own the guardrails, and the GPU bill.'],
  ['deepsleep', 'DeepSleep', 76, 0.5, 450, 0.5, 0.4, false, false, 2026, '#3a5ccc', 'Shockingly cheap and capable. Compliance teams frown.'],
  ['mistrale', 'Mistrale', 70, 1.2, 850, 0.6, 0.65, true, false, 2027, '#f5a524', 'EU-friendly. Comes with a small baguette.'],
].map(([id, name, capability, productCost, autoCost, guardrails, trust, complianceOk, selfHosted, releaseYear, color, blurb]) =>
  ({ id, name, capability, productCost, autoCost, guardrails, trust, complianceOk, selfHosted, releaseYear, color, blurb }));

const FB_ROLES = {
  engineer: { id: 'engineer', name: 'Engineer', color: '#4f8cff', automatedBy: { engineering: 1, qa: 0.5, ops: 0.4 }, defaultAssignment: 'maintenance' },
  designer: { id: 'designer', name: 'Designer', color: '#ff7eb6', automatedBy: { engineering: 0.35 }, defaultAssignment: 'idle' },
  marketer: { id: 'marketer', name: 'Marketer', color: '#ffb020', automatedBy: { marketing: 1 }, defaultAssignment: 'marketing' },
  support: { id: 'support', name: 'Support', color: '#34c38f', automatedBy: { support: 1 }, defaultAssignment: 'support' },
  security: { id: 'security', name: 'Security', color: '#e5484d', automatedBy: { ops: 0.6 }, defaultAssignment: 'security' },
  sales: { id: 'sales', name: 'Sales', color: '#9b6bff', automatedBy: { sales: 1 }, defaultAssignment: 'sales' },
};

const FB_TRAITS = [
  ['craftsperson', 'Craftsperson', 'Polish is a calling. Hates watching machines do it.'],
  ['hype_machine', 'Hype Machine', 'Can make a settings page sound like a moon landing.'],
  ['paranoid', 'Paranoid', 'Reads every agent log. Catches things.'],
  ['mentor', 'Mentor', 'Juniors grow fast around them.'],
  ['night_owl', 'Night Owl', 'Does their best work at 2am.'],
  ['vibe_coder', 'Vibe Coder', 'Ships features fast. Tests are a vibe too.'],
  ['burnout_prone', 'Burnout-prone', 'Sprints hard, crashes harder.'],
  ['loyal', 'Loyal', 'Unlikely to leave.'],
  ['job_hopper', 'Job Hopper', 'Always one recruiter email from leaving.'],
  ['tinkerer', 'Tinkerer', 'Novel ideas, learns by poking things.'],
  ['pragmatist', 'Pragmatist', 'Automation does not bother them much.'],
  ['perfectionist', 'Perfectionist', 'Slower, but it will not break.'],
  ['fast_learner', 'Fast Learner', 'Levels up quickly.'],
  ['old_guard', 'Old Guard', 'Remembers how everything works. Misses it.'],
  ['ai_enthusiast', 'AI Enthusiast', 'Loves the robots. Good overseer.'],
  ['people_person', 'People Person', 'Brings hype and good vibes.'],
  ['lone_wolf', 'Lone Wolf', 'Productive alone, poor mentor.'],
  ['caffeinated', 'Caffeinated', 'Output up, jitter up.'],
  ['visionary', 'Visionary', 'Big novel ideas.'],
  ['steady', 'Steady', 'Hard to tire, hard to lose.'],
  ['cynic', 'Cynic', 'Reliable work, hard to cheer up.'],
  ['red_teamer', 'Red Teamer', 'Thinks like an attacker. Great at catching incidents.'],
].map(([id, name, desc]) => ({ id, name, desc }));

const FB_POLICIES = [
  ['pair', 'AI as Pair, Not Replacement', 'Automation output reduced; meaning drain greatly reduced.', 0, 'Always available'],
  ['craft_fridays', 'Craft Fridays', '10% less output; meaning recovery and a polish bonus.', 0, 'Always available'],
  ['blameless', 'Blameless Postmortems', 'Incidents teach engineers instead of only hurting.', 200, 'Unlocks after your first incident'],
  ['comprehension_reviews', 'Code Comprehension Reviews', 'Slower shipping; pays down comprehension debt.', 0, 'Unlocks at 20 debt or the Office Floor'],
  ['apprenticeship', 'Apprenticeship Program', 'Costs money; juniors grow faster and recruit better.', 1500, 'Needs the Office Floor'],
  ['sabbatical', 'Sabbatical Program', 'Rotating absences; big meaning recovery.', 500, 'Needs the Office Floor'],
].map(([id, name, desc, weeklyCost, lockText]) => ({ id, name, desc, weeklyCost, lockText }));

const FB_POLICY_UNLOCK = {
  pair: () => true,
  craft_fridays: () => true,
  blameless: (s) => (s.stats?.incidents ?? 0) >= 1,
  comprehension_reviews: (s) => s.comprehensionDebt >= 20 || s.officeStage >= 1,
  apprenticeship: (s) => s.officeStage >= 1,
  sabbatical: (s) => s.officeStage >= 1,
};

const FB_CHANNELS = [
  ['launch', 'Launch Campaign', 5000, 3, 9, 0.4, 0, 'A proper launch: landing page, emails, a video.', '🚀'],
  ['content', 'Content and Blog', 2500, 8, 2, 0.5, 0, 'Slow and steady. Builds brand.', '✍️'],
  ['producthunt', 'Product Hunt Day', 1500, 1, 22, 0.6, 0, 'One wild day of upvotes.', '🐱'],
  ['community', 'Community Discord', 3000, 12, 1.5, 0.7, 0, 'Your biggest fans, in one server.', '💬'],
  ['ads', 'Paid Ads', 12000, 4, 8, 0.1, 0, 'Money in, clicks out. No love.', '📣'],
  ['influencer', 'Influencer Deal', 20000, 2, 20, 0.2, 1, 'A creator unboxes your SaaS. Somehow.', '🤳'],
  ['conference', 'Conference Booth', 35000, 2, 14, 1.5, 1, 'Swag, handshakes, and real brand.', '🎪'],
  ['enterprise', 'Enterprise Sales Hire', 30000, 10, 2, 0.8, 1, 'Golf, steak dinners, big contracts.', '💼'],
].map(([id, name, cost, weeks, hype, brand, minStage, desc, icon]) => ({ id, name, cost, weeks, hype, brand, minStage, desc, icon }));

const FB_OFFICE = [
  { id: 'garage', name: 'Garage', capacity: 4, rent: 300, upgradeCost: 0, size: [10, 8] },
  { id: 'floor', name: 'Office Floor', capacity: 12, rent: 3500, upgradeCost: 60000, size: [18, 14] },
  { id: 'hq', name: 'HQ Building', capacity: 30, rent: 14000, upgradeCost: 400000, size: [28, 22] },
];

const FB_TRENDS = {
  agents_hot: 'Agents Are Hot', ai_fatigue: 'AI Fatigue', compliance: 'Compliance Crackdown', voice_boom: 'Voice Boom',
  budget_cuts: 'Budget Cuts', remote_wave: 'Remote Wave', security_scare: 'Security Scare', creator_economy: 'Creator Economy', steady: 'Steady Market',
};

const FB_B = {
  salary: { junior: 900, mid: 1600, senior: 2600 }, hireFeeWeeks: 2, trainingCost: 3000, runwayLoseWeeks: 8,
  sizes: { small: { points: 110, cost: 2000, minStage: 0 }, medium: { points: 280, cost: 8000, minStage: 0 }, large: { points: 650, cost: 25000, minStage: 1 } },
  auditCost: 15000, toolingWeekly: 900, consultantCost: 45000, wrapperGap: 2.5, gpuWeeklySelfHost: 1200,
  oversightHoursPerLevel: { engineering: 20, support: 14, sales: 8, marketing: 6, qa: 10, ops: 24 },
  oversightHoursPerPerson: 20, autoEngPoints: 16, pairAutoMult: 0.6,
  ipoMrr: 1500000, ipoBrand: 60, runWeeks: 780, sabbaticalWeeks: 4,
  postureSecurityPerSkill: 0.6, postureTooling: 12, postureDebtPenalty: 0.5,
  seniorityOutput: { junior: 0.6, mid: 1.0, senior: 1.45 },
};

export const B = { ...FB_B, ...(BAL ?? {}) };

export const CATEGORIES = asList(DATA.CATEGORIES) ?? FB_CATEGORIES;
export const ANGLES = asList(DATA.ANGLES) ?? FB_ANGLES;
export const MODELS = asList(DATA.MODELS) ?? FB_MODELS;
export const ROLES = DATA.ROLES ?? FB_ROLES;
export const TRAITS = asList(DATA.TRAITS) ?? FB_TRAITS;
export const POLICIES = (asList(DATA.POLICIES) ?? FB_POLICIES).map((p) => ({
  ...p,
  lockText: p.lockText ?? FB_POLICIES.find((f) => f.id === p.id)?.lockText ?? 'Locked',
}));
export const CHANNELS = (asList(DATA.CHANNELS) ?? FB_CHANNELS).map((c) => ({ ...c, icon: c.icon ?? FB_CHANNELS.find((f) => f.id === c.id)?.icon ?? '📣' }));
export const OFFICE_STAGES = asList(DATA.OFFICE_STAGES) ?? FB_OFFICE;

export const CATEGORY = byId(CATEGORIES);
export const ANGLE = byId(ANGLES);
export const MODEL = byId(MODELS);
export const TRAIT = byId(TRAITS);
export const POLICY = byId(POLICIES);
export const CHANNEL = byId(CHANNELS);

export const FUNCTIONS = ['engineering', 'support', 'sales', 'marketing', 'qa', 'ops'];
export const FUNCTION_INFO = {
  engineering: { name: 'Engineering', icon: '⌨️' }, support: { name: 'Support', icon: '🎧' }, sales: { name: 'Sales', icon: '💼' },
  marketing: { name: 'Marketing Copy', icon: '✍️' }, qa: { name: 'QA', icon: '🧪' }, ops: { name: 'Ops', icon: '🖥️' },
};

export function trendName(id) {
  const t = DATA.TRENDS ? (asList(DATA.TRENDS).find((x) => x.id === id)) : null;
  return t?.name ?? FB_TRENDS[id] ?? String(id ?? '');
}

export function comboFit(cat, angle) {
  if (typeof DATA.comboFit === 'function') return DATA.comboFit(cat, angle);
  return 1;
}

export function policyUnlocked(state, p) {
  if (typeof p.unlock === 'function') return !!p.unlock(state);
  return (FB_POLICY_UNLOCK[p.id] ?? (() => true))(state);
}

export function categoryName(id) { return CATEGORY[id]?.name ?? id; }
export function angleName(id) { return ANGLE[id]?.name ?? id; }
export function modelName(id) { return MODEL[id]?.name ?? id; }
export function modelColor(id) { return MODEL[id]?.color ?? '#8a8a8a'; }
export function roleColor(role) { return ROLES[role]?.color ?? '#8a8a8a'; }
export function roleName(role) { return ROLES[role]?.name ?? role; }
export function traitInfo(id) { return TRAIT[id] ?? { id, name: id.replace(/_/g, ' '), desc: '' }; }

export function capacityOf(state) {
  return OFFICE_STAGES[state.officeStage]?.capacity ?? 4;
}

export const ASSIGNMENT_LABEL = {
  project: 'Project', maintenance: 'Maintenance', oversight: 'Oversight', mentor: 'Mentoring', hardProblem: 'Hard Problem',
  support: 'Support', sales: 'Sales', security: 'Security', marketing: 'Marketing', idle: 'Idle', sabbatical: 'Sabbatical',
};

export const MOOD_INFO = {
  ok: { name: 'Happy', color: '#34c38f', icon: '😊' },
  coasting: { name: 'Coasting', color: '#f5a524', icon: '😐' },
  burnout: { name: 'Burnout', color: '#e5484d', icon: '😵' },
  away: { name: 'Away', color: '#7fa6c8', icon: '🏖️' },
};

export const INCIDENT_LABEL = {
  db_wipe: 'Agent wiped a database', runaway_spend: 'Runaway cloud spend', refund_hallucination: 'Refund hallucination',
  pricing_rewrite: 'Agent rewrote pricing', mass_email: 'Agent emailed everyone', prompt_injection_leak: 'Prompt injection leak',
  credential_stuffing: 'Credential stuffing', ransomware: 'Ransomware', supply_chain: 'Supply chain compromise',
  data_exfiltration: 'Data exfiltration', phishing: 'Phishing',
};
