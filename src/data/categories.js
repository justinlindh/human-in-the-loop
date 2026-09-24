// tam: addressable customers. price: dollars per customer per month.
const rows = [
  ['notes', 'Notes', 180000, 12, 2026, false, '📝'],
  ['email', 'Email', 220000, 10, 2026, false, '✉️'],
  ['pm', 'Project Management', 120000, 25, 2026, false, '📋'],
  ['support', 'Support Desk', 60000, 60, 2026, false, '🎧'],
  ['crm', 'CRM', 80000, 70, 2027, false, '🤝'],
  ['analytics', 'Analytics', 70000, 55, 2027, false, '📈'],
  ['design', 'Design Tools', 90000, 30, 2028, false, '🎨'],
  ['devtools', 'Dev Tools', 100000, 35, 2028, false, '🛠️'],
  ['hr', 'HR', 40000, 90, 2029, true, '🧑‍💼'],
  ['recruiting', 'Recruiting', 35000, 110, 2029, true, '🔎'],
  ['accounting', 'Accounting', 50000, 95, 2030, true, '🧮'],
  ['video', 'Video Editing', 110000, 28, 2030, false, '🎬'],
  ['legal', 'Legal', 20000, 250, 2031, true, '⚖️'],
  ['security', 'Security', 30000, 180, 2032, true, '🛡️'],
];

export const CATEGORIES = Object.fromEntries(rows.map(([id, name, tam, price, unlockYear, compliance, icon]) => [
  id, { id, name, tam, price, unlockYear, compliance, icon },
]));
