// title: job title used in promotions ("a Senior Support Specialist").
// automatedBy: how much each automation function's level eats into this role's work (0..1).
export const ROLES = {
  engineer: { id: 'engineer', name: 'Engineer', title: 'Engineer', color: '#4f8cff', automatedBy: { engineering: 1, qa: 0.5, ops: 0.4 }, defaultAssignment: 'maintenance' },
  designer: { id: 'designer', name: 'Designer', title: 'Designer', color: '#ff7eb6', automatedBy: { engineering: 0.35 }, defaultAssignment: 'idle' },
  marketer: { id: 'marketer', name: 'Marketer', title: 'Marketer', color: '#ffb020', automatedBy: { marketing: 1 }, defaultAssignment: 'marketing' },
  support: { id: 'support', name: 'Support', title: 'Support Specialist', color: '#34c38f', automatedBy: { support: 1 }, defaultAssignment: 'support' },
  security: { id: 'security', name: 'Security', title: 'Security Engineer', color: '#4d6285', automatedBy: { ops: 0.6 }, defaultAssignment: 'security' },
  sales: { id: 'sales', name: 'Sales', title: 'Account Executive', color: '#9b6bff', automatedBy: { sales: 1 }, defaultAssignment: 'sales' },
};
