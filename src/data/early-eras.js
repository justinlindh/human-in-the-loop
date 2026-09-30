// Earlier eras use negative ordinals; Classic and every AI gate keep their modern ordinal.
export const EARLY_ORDER = ['preinternet', 'dotcom', 'web2'];
export const EARLY_ERAS = [{
  id: 'dotcom', name: 'The Dot-com Boom',
  blurb: 'Every company needs a website. Every website apparently needs an IPO.',
  changes: ['Build web and on-prem products', 'A boom brings customers, a float brings cash and dilution', 'Keep runway for the bust; recovery carries your company forward'],
}, {
  id: 'web2', name: 'Web 2.0: The IE6 Years',
  blurb: 'The browser is the platform. The approved browser is the problem.',
  changes: ['New web products include old-browser QA work', 'Experienced senior engineers can earn Legacy Whisperer', 'Keep the company through the transition to Classic'],
}];

export const PERIOD_MARKETS = {
  dotcom: { categories: ['notes', 'email', 'pm', 'support'], angles: ['web', 'onprem'], trends: ['steady', 'budget_cuts', 'security_scare'] },
  web2: { categories: ['notes', 'email', 'pm', 'support', 'crm', 'analytics', 'design', 'devtools'], angles: ['web', 'onprem', 'api', 'freemium'], trends: ['steady', 'budget_cuts', 'security_scare'] },
};
export const DOTCOM_NAMES = ['Under Construction', 'Portal Combat', 'Click And Mortar', 'Eyeballs Enterprise'];
// Display metadata only: channels, action ids and saved Yak settings keep their original keys.
export const PERIOD_CHAT_APPS = {
  preinternet: { id: 'desknet', name: 'DeskNet', status: 'LAN bulletin board', away: '/me checks the noticeboard', channels: { general: 'office', random: 'breakroom', incidents: 'helpdesk', wins: 'releases', standup: 'rollcall' } },
  dotcom: { id: 'awayim', name: 'AwayIM', status: 'Buddy List', away: 'Away: building the future. Back after lunch.', channels: { general: 'Office Chat', random: 'Water Cooler', incidents: 'Help Desk', wins: 'Ship It!', standup: 'Roll Call' } },
  web2: { id: 'hipcheck', name: 'HipCheck', status: 'Team rooms', away: 'Status: works in the approved browser.', channels: { general: 'Lobby', random: 'Off topic', incidents: 'Operations', wins: 'Releases', standup: 'Daily updates' } },
};
const YAK = { id: 'yak', name: 'Yak' };
export const chatApp = (state) => PERIOD_CHAT_APPS[state?.era?.id] ?? YAK;
export const chatAppName = (state) => chatApp(state).name;
export const WEB2_CHAT = { id: 'web2_box_model', lines: [
  'The box model hack is done. The box is wider inside the client demo.',
  'The conditional comment has conditions. I respect its boundaries.',
  'Added a shim, a polyfill and a clearfix. The page now qualifies as infrastructure.',
  'It works on my machine. We are considering mailing my machine to the client.',
  'Foxfire is not approved. Internet Exploder 6 has seniority.',
] };
export const WEB2_COPY = {
  legacy_compat: { id: 'legacy_compat', name: 'Old Browser Compatibility' },
  web2_best_viewed: { id: 'web2_best_viewed', text: 'Best viewed in whichever browser finance approved.' },
  web2_browser_retired: { id: 'web2_browser_retired', text: 'An old HipCheck thread resurfaces: "Internet Exploder 6 is retired. We can delete the workaround." "Which one?" New web projects no longer include old-browser QA work.' },
};
export const DOTCOM_CHAT = [
  'Away message: building the future. Back after lunch.',
  'The website has a visitor counter. We have agreed not to refresh it during board meetings.',
  'Our business plan fits on a napkin. The financial projections require a tablecloth.',
  'The CRT is warm enough to proof bread. Facilities has asked us not to test this.',
  'The cubicle walls are low enough for collaboration and high enough to hide the printer jam.',
];

// Keep campaign mechanics stable while period copy describes the channel the company actually buys.
export const PERIOD_CHANNELS = {
  web2: {
    launch: { name: 'Directory Launch', desc: 'A listing, a demo and a comments section with opinions about both.' },
    content: { name: 'Company Blog', desc: 'An RSS feed and useful advice. The gradient is optional.' },
    community: { name: 'Community Forum', desc: 'A place for users to help each other and discuss your rounded corners.' },
    ads: { name: 'Search Ads', desc: 'Buy a few words beside the results. Finance has discovered keywords.' },
    conference: { name: 'Web Conference', desc: 'A live demo, a lanyard and a very shiny logo.' },
    enterprise: { name: 'Enterprise Sales', desc: 'Procurement likes the product. IT would like it to run in the approved browser.' },
  },
  dotcom: {
    launch: { name: 'Web Directory Launch', desc: 'A directory listing, a demo and a press release with a very long fax number.' },
    content: { name: 'Email Newsletter', desc: 'Useful tips delivered directly to an inbox. Please stop forwarding the test issue.' },
    community: { name: 'Message Board', desc: 'A home for your most loyal users and their elaborate signatures.' },
    ads: { name: 'Banner Ads', desc: 'Buy rectangles on other websites. Some of them even load.' },
    conference: { name: 'Trade Show Booth', desc: 'Printed brochures, a live demo and a suitcase full of cables.' },
    enterprise: { name: 'Enterprise Sales', desc: 'Slide decks, procurement forms and a meeting about the meeting.' },
  },
};
export function periodChannel(eraId, channel) {
  const overrides = PERIOD_CHANNELS[eraId];
  return overrides ? overrides[channel.id] ? { ...channel, ...overrides[channel.id] } : null : channel;
}
