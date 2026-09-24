// tam: addressable customers. price: dollars per customer per month.
const rows = [
  ['notes', 'Notes', 180000, 12, 2019, false, '📝'],
  ['email', 'Email', 220000, 10, 2019, false, '✉️'],
  ['pm', 'Project Management', 120000, 25, 2019, false, '📋'],
  ['support', 'Support Desk', 60000, 60, 2019, false, '🎧'],
  ['crm', 'CRM', 80000, 70, 2020, false, '🤝'],
  ['analytics', 'Analytics', 70000, 55, 2020, false, '📈'],
  ['design', 'Design Tools', 90000, 30, 2021, false, '🎨'],
  ['devtools', 'Dev Tools', 100000, 35, 2021, false, '🛠️'],
  ['hr', 'HR', 40000, 90, 2023, true, '🧑‍💼'],
  ['recruiting', 'Recruiting', 35000, 110, 2023, true, '🔎'],
  ['accounting', 'Accounting', 50000, 95, 2024, true, '🧮'],
  ['video', 'Video Editing', 110000, 28, 2024, false, '🎬'],
  ['legal', 'Legal', 20000, 250, 2026, true, '⚖️'],
  ['security', 'Security', 30000, 180, 2027, true, '🛡️'],
];

export const CATEGORIES = Object.fromEntries(rows.map(([id, name, tam, price, unlockYear, compliance, icon]) => [
  id, { id, name, tam, price, unlockYear, compliance, icon },
]));
