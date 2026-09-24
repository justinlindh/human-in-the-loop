// Display helpers over the sim lane's content data and balance constants.
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
import { B } from '../sim/balance.js';

export { B };

export { ROLES, OFFICE_STAGES, comboFit, incumbentFor };

export const CATEGORIES = Object.values(CAT_MAP);
export const ANGLES = Object.values(ANGLE_MAP);
export const MODELS = Object.values(MODEL_MAP);
export const TRAITS = Object.values(TRAIT_MAP);
export const POLICIES = Object.values(POLICY_MAP);
export const CHANNELS = Object.values(CHANNEL_MAP);

export const CATEGORY = CAT_MAP;
export const ANGLE = ANGLE_MAP;
export const MODEL = MODEL_MAP;
export const TRAIT = TRAIT_MAP;
export const POLICY = POLICY_MAP;
export const CHANNEL = CHANNEL_MAP;

export const FUNCTIONS = ['engineering', 'support', 'sales', 'marketing', 'qa', 'ops'];
export const FUNCTION_INFO = {
  engineering: { name: 'Engineering' }, support: { name: 'Support' }, sales: { name: 'Sales' },
  marketing: { name: 'Marketing Copy' }, qa: { name: 'QA' }, ops: { name: 'Ops' },
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
  ok: { name: 'Happy', color: '#34c38f' },
  coasting: { name: 'Coasting', color: '#f5a524' },
  burnout: { name: 'Burnout', color: '#e5484d' },
  away: { name: 'Away', color: '#7fa6c8' },
};

export const INCIDENT_LABEL = {
  db_wipe: 'Agent wiped a database', runaway_spend: 'Runaway cloud spend', refund_hallucination: 'Refund hallucination',
  pricing_rewrite: 'Agent rewrote pricing', mass_email: 'Agent emailed everyone', prompt_injection_leak: 'Prompt injection leak',
  credential_stuffing: 'Credential stuffing', ransomware: 'Ransomware', supply_chain: 'Supply chain compromise',
  data_exfiltration: 'Data exfiltration', phishing: 'Phishing',
};
