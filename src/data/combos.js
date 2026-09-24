export const COMBO_OVERRIDES = {
  'support:agent': 1.5, 'email:summarizer': 1.45, 'notes:summarizer': 1.3, 'pm:workflow': 1.4,
  'crm:agent': 1.35, 'analytics:copilot': 1.3, 'design:copilot': 1.35, 'devtools:agent': 1.45,
  'devtools:copilot': 1.4, 'hr:workflow': 1.3, 'recruiting:agent': 1.3, 'accounting:vertical': 1.45,
  'legal:vertical': 1.5, 'legal:summarizer': 1.4, 'video:native': 1.35, 'video:voice': 1.2,
  'security:agent': 1.3, 'security:vertical': 1.4, 'support:voice': 1.3, 'crm:voice': 1.2,
  'notes:voice': 1.15, 'email:agent': 1.25, 'pm:summarizer': 1.2,
  'email:native': 0.7, 'notes:native': 0.75, 'legal:voice': 0.65, 'accounting:voice': 0.6,
  'security:voice': 0.6, 'video:summarizer': 0.8, 'design:summarizer': 0.7, 'hr:voice': 0.75,
  'analytics:voice': 0.7, 'legal:agent': 0.8, 'accounting:agent': 0.85,
};

export const comboFit = (category, angle) => COMBO_OVERRIDES[`${category}:${angle}`] ?? 1.0;
