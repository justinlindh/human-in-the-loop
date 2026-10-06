// Stock company names for the founding screen's Suggest button: a general pool, plus a few per starting era.
// A roll picks from the era's pool and the general one, or builds a "Maple" + "works" style name.
const GENERAL = [
  'Pivot Table Labs', 'Per Seat Pricing Co', 'Churn Labs', 'Dashboard Dreams', 'Net Promoter Labs',
  'Quarterly Goals Co', 'Standup Comedy Inc', 'Growth Hack Collective', 'Synergy Cloud', 'Single Pane of Glass',
  'Roadmap Rodeo', 'Seat Warmers Software', 'Low Code, High Hopes', 'Freemium Foundry', 'Sticky Note Systems',
];
const BY_ERA = {
  preinternet: [
    'Beige Box Software', 'Dot Matrix Digital', 'Spreadsheet Brothers', 'Shrinkwrap Systems',
    'Baud & Associates', 'Cartridge Works', 'Mainframe Mutual', 'Punchcard Press',
  ],
  dotcom: [
    'Pets Dot Everything', 'Eyeball Express', 'Synergy.net', 'Burn Rate Brothers',
    'Clicks & Mortar', 'Portalicious', 'Zeppelin.com', 'Stock Options Unlimited',
  ],
  web2: [
    'Blogster Beta', 'Mashup Mansion', 'Tagr Labs', 'Rounded Corners Inc',
    'Gradient Lab', 'Beta Forever', 'Widgetly', 'Cloudish',
  ],
  chatgbt: ['Prompt & Circumstance', 'Token Economy', 'Wrapper Labs', 'Vibe Check Labs', 'Fine Tune Labs'],
  agents: ['Context Window Co', 'Stochastic Parrot Co', 'Hallucinate Labs', 'Latent Space Lab', 'Agent Provocateur'],
};
const NAME_A = ['Loop', 'Pair', 'Kindly', 'Tiny', 'Candor', 'Hearth', 'Paper', 'Lantern', 'Honest', 'Maple', 'Orbit', 'Quiet'];
const NAME_B = ['works', 'labs', ' & Co', ' Software', 'craft', ' Systems', 'house', ' Collective', 'forge', ' Studio'];

export const STOCK_NAMES = [GENERAL, ...Object.values(BY_ERA)].flat();

// `rnd` returns [0, 1). About two rolls in three are stock names.
export function suggestCompany(era = 'classic', rnd = Math.random) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  if (rnd() < 2 / 3) return pick([...GENERAL, ...(BY_ERA[era] ?? [])]);
  return `${pick(NAME_A)}${pick(NAME_B)}`;
}
