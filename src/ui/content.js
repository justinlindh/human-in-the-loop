// Display helpers over the sim lane's content data. Tunables come from src/sim/balance.js
// when it is present; FB_B covers the few the UI shows until then.
import { CATEGORIES as CAT_MAP } from '../data/categories.js';
import { ANGLES as ANGLE_MAP } from '../data/angles.js';
import { MODELS as MODEL_MAP } from '../data/models.js';
import { ROLES } from '../data/roles.js';
import { TRAITS as TRAIT_MAP } from '../data/traits.js';
import { POLICIES as POLICY_MAP } from '../data/policies.js';
import { CHANNELS as CHANNEL_MAP } from '../data/channels.js';
import { OFFICE_STAGES } from '../data/office.js';
import { TRENDS } from '../data/trends.js';
import { comboFit } from '../data/combos.js';
import { incumbentFor } from '../data/incumbents.js';

const balanceMods = import.meta.glob('../sim/balance.js', { eager: true });
const BAL = Object.values(balanceMods)[0]?.B ?? null;

const FB_B = {
  salary: { junior: 900, mid: 1600, senior: 2600 }, hireFeeWeeks: 2, trainingCost: 3000, runwayLoseWeeks: 8,
  sizes: { small: { points: 110, cost: 2000, minStage: 0 }, medium: { points: 280, cost: 8000, minStage: 0 }, large: { points: 650, cost: 25000, minStage: 1 } },
  auditCost: 15000, toolingWeekly: 900, consultantCost: 45000, wrapperGap: 2.5, gpuWeeklySelfHost: 1200,
  oversightHoursPerLevel: { engineering: 20, support: 14, sales: 8, marketing: 6, qa: 10, ops: 24 },
  oversightHoursPerPerson: 20, autoEngPoints: 16, pairAutoMult: 0.6, pointsGrowthPerYear: 0.1,
  ipoMrr: 1500000, ipoBrand: 60, runWeeks: 780, sabbaticalWeeks: 4, xpPerLevel: 60, candidateRefreshWeeks: 4,
  postureSecurityPerSkill: 0.6, postureTooling: 12, postureDebtPenalty: 0.5,
  seniorityOutput: { junior: 0.6, mid: 1.0, senior: 1.45 },
};

export const B = BAL ?? FB_B;
export { ROLES, OFFICE_STAGES, comboFit, incumbentFor };

const CHANNEL_ICON = { launch: '🚀', content: '✍️', producthunt: '🐱', community: '💬', ads: '📣', influencer: '🤳', conference: '🎪', enterprise: '💼' };

export const CATEGORIES = Object.values(CAT_MAP);
export const ANGLES = Object.values(ANGLE_MAP);
export const MODELS = Object.values(MODEL_MAP);
export const TRAITS = Object.values(TRAIT_MAP);
export const POLICIES = Object.values(POLICY_MAP);
export const CHANNELS = Object.values(CHANNEL_MAP).map((c) => ({ ...c, icon: CHANNEL_ICON[c.id] ?? '📣' }));

export const CATEGORY = CAT_MAP;
export const ANGLE = ANGLE_MAP;
export const MODEL = MODEL_MAP;
export const TRAIT = TRAIT_MAP;
export const POLICY = POLICY_MAP;
export const CHANNEL = Object.fromEntries(CHANNELS.map((c) => [c.id, c]));

export const FUNCTIONS = ['engineering', 'support', 'sales', 'marketing', 'qa', 'ops'];
export const FUNCTION_INFO = {
  engineering: { name: 'Engineering', icon: '⌨️' }, support: { name: 'Support', icon: '🎧' }, sales: { name: 'Sales', icon: '💼' },
  marketing: { name: 'Marketing Copy', icon: '✍️' }, qa: { name: 'QA', icon: '🧪' }, ops: { name: 'Ops', icon: '🖥️' },
};

export function trendName(id) {
  return TRENDS[id]?.name ?? String(id ?? '');
}
export function trendText(id) {
  return TRENDS[id]?.text ?? '';
}

export function policyUnlocked(state, p) {
  try { return !!p.unlock?.(state); } catch { return false; }
}
export function policyLockText(p) {
  return p.lockText ?? 'Not unlocked yet';
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
