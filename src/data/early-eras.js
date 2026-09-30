// Earlier eras use negative ordinals; Classic and every AI gate keep their modern ordinal.
export const EARLY_ORDER = ['preinternet', 'dotcom', 'web2'];
export const EARLY_ERAS = [{
  id: 'dotcom', name: 'The Dot-com Boom',
  blurb: 'Every company needs a website. Every website apparently needs an IPO.',
  changes: ['Build web and on-prem products', 'A boom brings customers, a float brings cash and dilution', 'Keep runway for the bust; recovery leads into Classic'],
}];

export const PERIOD_MARKETS = {
  dotcom: { categories: ['notes', 'email', 'pm', 'support'], angles: ['web', 'onprem'], trends: ['steady', 'budget_cuts', 'security_scare'] },
};
export const DOTCOM_NAMES = ['Under Construction', 'Portal Combat', 'Click And Mortar', 'Eyeballs Enterprise'];
export const chatAppName = (state) => state.era?.id === 'dotcom' ? 'AwayIM' : 'Yak';
export const DOTCOM_CHAT = [
  'Away message: building the future. Back after lunch.',
  'The website has a visitor counter. We have agreed not to refresh it during board meetings.',
  'Our business plan fits on a napkin. The financial projections require a tablecloth.',
  'The CRT is warm enough to proof bread. Facilities has asked us not to test this.',
  'The cubicle walls are low enough for collaboration and high enough to hide the printer jam.',
];

// Keep campaign mechanics stable while period copy describes the channel the company actually buys.
export const PERIOD_CHANNELS = {
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
