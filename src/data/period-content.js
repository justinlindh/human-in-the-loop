import { PERIOD_CHAT_APPS } from './early-eras.js';

export const isPeriod = (state) => !!PERIOD_CHAT_APPS[state?.era?.id];

// Copy overlays retain the original ids, prerequisites, effects and saved records.
const SHARED = {
  research: {
    observability: { name: 'Operations Console', desc: 'One place for server logs and warning lights. Outages fixed 40% faster and rarely unfixable.' },
    ci_cd: { name: 'Nightly Build', desc: 'The build runs while everyone sleeps. +10% reliability, slower health decay.' },
    design_system: { name: 'Interface Style Guide', desc: 'The same buttons in every dialog. +10% polish.' },
    red_team_suite: { name: 'Security Test Lab', desc: 'Try to break in before somebody else does. +10 security posture.' },
  },
  traits: {
    job_hopper: { desc: 'Keeps a fresh resume beside the fax machine.' },
    caffeinated: { desc: 'Runs on filter coffee and optimism.' },
  },
  founders: { engineer: { blurb: 'Has opinions about databases and a side project on a stack of disks. Builds things that work.' } },
  press: {
    techcrunchy: { name: 'Byte Register' }, vergence: { name: 'Desktop Review' },
    hackerolds: { name: 'The Shareware Circular' }, wiredish: { name: 'Wired-ish' },
  },
  incumbents: {
    notian: { name: 'Lotus Position' }, gmale: { name: 'Postmaster Pro' }, jirra: { name: 'Project Foreman' },
    zendisk: { name: 'HelpDesk Deluxe' }, salesfarce: { name: 'Contact Cabinet' }, lookerish: { name: 'Crystal Ball Reports' },
    figmo: { name: 'Pixel Studio' }, githug: { name: 'Source Safehouse' }, workdai: { name: 'Personnel Files' },
    linkedout: { name: 'Resume Exchange' }, crowdstrife: { name: 'Firewall Fortress' },
  },
  epilogues: {
    story_alumni: { text: '{alumni} people have worked at {company} and moved on. Most still read the company newsletter. Some write back.' },
    ipo_bell: { text: '{company} rang the opening bell. Someone from the garage days cried in front of the office television.' },
    runway: { text: 'The money ran out on a Tuesday. The last {chatApp} message said "we tried". Someone printed it before unplugging the server.' },
    miserable_team: { text: 'The office is full of people signing off on changes they do not read. The lights are on. Nobody is home.' },
    generic_group_chat: { text: 'The old team still shares a mailing list. The jokes arrive under increasingly long subject lines.' },
    humans_everywhere: { text: 'Every release had a person behind it. Usually the same tired person, holding a checklist.' },
  },
};

export const PERIOD_COPY = {
  preinternet: SHARED,
  dotcom: { ...SHARED, trends: {
    steady: { name: 'Steady Traffic', text: 'The visitor counter is moving at an ordinary speed. The board has asked whether it is broken.' },
    budget_cuts: { name: 'Procurement Freeze', text: 'Customers are extending their licences. Your fax machine has become a negotiation tool.' },
    security_scare: { name: 'Server Break-in', text: 'A company made the front page for the wrong reason. Everyone wants a firewall diagram.' },
  } },
  web2: { ...SHARED, research: { ...SHARED.research,
    ci_cd: { name: 'Build Server', desc: 'Every check-in gets a build and a test run. +10% reliability, slower health decay.' },
    design_system: { name: 'Component Library', desc: 'Reusable controls, including the browser workarounds. +10% polish.' },
  }, trends: {
    steady: { name: 'Paying Visitors', text: 'The revenue report contains revenue. Nobody has put it in a glossy reflection yet.' },
    budget_cuts: { name: 'Licence Review', text: 'Finance wants fewer renewals. IT wants to keep the browser that came with the building.' },
    security_scare: { name: 'Password Panic', text: 'A leaked password list is doing the rounds. The reset form is suddenly your busiest page.' },
  } },
};

export function periodCopy(state, pool, row) {
  const copy = PERIOD_COPY[state?.era?.id]?.[pool]?.[row?.id];
  if (!copy) return row;
  const result = { ...row, ...copy };
  if (result.text) result.text = result.text.replaceAll('{chatApp}', PERIOD_CHAT_APPS[state.era.id].name);
  return result;
}

const OFFICE_CHATTER = {
  happy: ['The build finished before the coffee.', 'Someone labelled the backup tapes. Thank you.'],
  coasting: ['Rearranged my desktop icons. Big afternoon.', 'Waiting for five o\'clock. The clock is winning.'],
  burnout: ['The pager has learned where I live.', 'Taking a long lunch. Possibly forever.'],
  automated: ['The batch job finished. I am still here.', 'Waiting for the compiler. It has no appointments.'],
  mentor: ['Explained the billing service with a pencil.', 'My junior found my bug. Proud. Slightly wounded.'],
  junior: ['First patch accepted without corrections!', 'Wrote a test that caught a real bug. Hooked.'],
  incident: ['Checking the server logs. Please hold.', 'Rolling back. Nobody breathe on anything.'],
  idle: ['Anyone need a hand with anything?', 'Reading the manual. There is a plot twist.'],
  overseer: ['Checking the release checklist twice.', 'Reading the logs. The logs are not reading back.'],
  hello: ['Hello! Which extension reaches the help desk?', 'First day. I brought biscuits and a notebook.'],
  farewell: ['Signing off. My notes are in the top drawer.', 'Keep the backups. Please keep the backups.'],
};
export const PERIOD_CHATTER = {
  dotcom: { ...OFFICE_CHATTER,
    happy: ['Our guestbook has a compliment from a stranger.', 'The page loads before the modem finishes singing.'],
    idle: ['Adding a visitor counter to the visitor counter.', 'brb, untangling the cable behind the CRT.'],
  },
  web2: { ...OFFICE_CHATTER,
    happy: ['The page works in both browsers. Both!', 'RSS says we shipped. RSS is unusually cheerful.'],
    idle: ['Testing the rounded corners in the square browser.', 'Reading the wiki. Fixing the wiki. Reading again.'],
  },
};
export const periodChatter = (state, key, fallback) => PERIOD_CHATTER[state?.era?.id]?.[key] ?? fallback;

export const PERIOD_POSTS = {
  pep_talk: { text: ['Good work, everyone. The next release is in good hands.', 'Thank you for sticking with this. It matters.'] },
  who_broke_prod: { text: ['Who changed the live server?', 'The service is down. Who has the last good backup?'] },
  meme: { label: 'Forward a joke', text: [
    'Forwarded from the mailing list: the backup is in a safe place. We are now searching for the safe place.',
    'Notice beside the printer: please allow one working day for the paper jam to consider your request.',
    'Technical support: have you tried turning the deadline off and on again?',
  ], replies: { landed: ['Printing that for the noticeboard.', 'Sending this to the next desk.', 'That got a laugh.'],
    flat: ['This one has been round the mailing list.', 'Still funny. Still the same joke.'],
    backfired: ['Can the joke wait until the service is back?', 'Please check the server first.'],
    tired: ['I will laugh after a nap.'] } },
  pizza: { replies: { backfired: ['Cold pizza beside a hot server. Dinner is sorted.'] } },
  announcement: { vague: ['Staff meeting at four. Please bring a notebook.', 'Company notice: gather by the noticeboard after lunch.'],
    replies: { landed: ['Putting this in the newsletter.', 'Good news. Thanks for telling us.', 'I am phoning home about this.'] } },
};
export function periodPost(state, post) {
  const copy = isPeriod(state) && PERIOD_POSTS[post?.id];
  return copy ? { ...post, ...copy, replies: { ...post.replies, ...copy.replies } } : post;
}

export const PERIOD_BROADCASTS = [{
  post: ['@channel who took the milk from the tea tray', '@channel found the milk. It was beside the tea tray.'],
  replies: ['The entire office has received the milk bulletin.', 'Please put it in the next newsletter.', 'I stood up for this.'],
}, {
  post: ['@channel does anyone have a spare printer ribbon', '@channel the printer ribbon was in the stationery drawer'],
  replies: ['The stationery drawer continues its unbeaten run.', 'Thank you for telling every desk.', 'Please stop testing the broadcast button.'],
}];
export const PERIOD_BROADCAST_SIGHS = ['Another office-wide message.', 'The noticeboard has fewer interruptions.', 'My screen just told me about the milk.'];

// These scenes rely on modern platforms or work customs. Text filtering still applies after this gate.
export const PERIOD_EXCLUDED = {
  events: ['bootcamp_grads', 'remote_debate', 'press_wrapper_mockery', 'viral_post', 'product_hunt_top', 'rival_jab', 'investor_demo_day'],
  talk: ['sso', 'chat_rival_jab', 'chat_rival_scoreboard', 'chat_rival_monitor', 'chat_who_owns', 'chat_packages', 'chat_cloud_bill', 'chat_lockdown_home'],
};
export const periodAllows = (state, pool, id) => !isPeriod(state) || !PERIOD_EXCLUDED[pool]?.includes(id);

const PERIOD_TEXT = {
  'Post it in #general. This team loves a small pull request.': 'Post it in #general. This team loves a small patch.',
  'Could someone look at my pull request? It is small. It is one line.': 'Could someone look at my patch? It is small. It is one line.',
  'We launched {product}. My mom liked the post. Can you like the post?': 'We launched {product}. My mum read the newsletter. Can you forward it?',
  'My mom liked your post too.': 'My mum printed your announcement too.',
  'I had a second copy. On my phone.': 'I had a second copy. On a disk in my coat.',
  'Every server now displays a skull and a crypto wallet address. The skull is animated.': 'Every server now displays a skull and a demand for a bank transfer. The skull is animated.',
  'A tiny package someone installed at 2 a.m. turned out to be a crypto miner in a trench coat.': 'A utility from a download mirror came with an extra program. It has been sending your files to a stranger.',
  'You now know what left-pad is. Again.': 'Every utility has a supplier. You now have a very long list of questions for them.',
  'Customers grumble, then enable two-factor.': 'Customers grumble, then choose passwords that are not their own names.',
};
export function periodText(state, text) {
  if (!isPeriod(state) || typeof text !== 'string') return text;
  if (state.era.id === 'dotcom') text = text
    .replaceAll('office Wi-Fi', 'office file server').replace(/\bwi-?fi\b/gi, 'network');
  return (PERIOD_TEXT[text] ?? text).replaceAll('Yak', PERIOD_CHAT_APPS[state.era.id].name)
    .replaceAll('TechCrunchy', SHARED.press.techcrunchy.name).replaceAll('The Vergence', SHARED.press.vergence.name)
    .replaceAll('Hacker Olds', SHARED.press.hackerolds.name);
}

export const PERIOD_VACATIONS = [
  'Out for two weeks. Please do not break anything I would have to fix.',
  'My away message is set. The train ticket is in my pocket.',
  'Vacation starts tomorrow. Instructions are in the blue folder.',
  'Off for two weeks. If the phone rings, I am not here.',
  'Taking a holiday. I will send a postcard with no error messages on it.',
];
export const PERIOD_FAREWELLS = [
  'Last day today. Thank you all. I am taking the good stapler.',
  'My notes are in the filing cabinet. They are even in order.',
  'Keep me on the mailing list. Especially the lunch one.',
  'Thank you for everything. Please water the plant by my desk.',
  'Moving on, but not far. My number is on the noticeboard.',
];
export const PERIOD_MOVE_REASONS = [
  'is moving closer to family. They promise to write.',
  'is going back to school to study something with no computers in it.',
  'is retiring to make pottery. Their first bowl is already better than the roadmap.',
  'is leaving to raise goats. The goats do not need status reports.',
  'is following their partner to another town. They left a forwarding address.',
  'is taking a year to sail somewhere. The boat has no telephone, on purpose.',
  'is joining a friend\'s company. They apologised four times while telling you.',
  'is moving home to help with the family bakery. They will send bread.',
];
export const PERIOD_RIVAL_NAMES = ['Synergo Systems', 'Plum Software', 'Bright Desktop', 'Taskwell', 'Note Cabinet', 'Quill Systems', 'Fernbase', 'Orbit Software', 'Kettle Works', 'Hive Labs', 'Paperplane', 'Stacksmith'];
