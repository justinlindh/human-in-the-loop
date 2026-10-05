import { B } from '../sim/balance.js';
// The inbox: letters from outside the company. Text placeholders: {company}, {companySlug} (for addresses), {companyTypo} (the name as an AI
// writer misspells it), {product}, {rival}, {rivalFounder}, {staff} (the person a mail is about), {model} (a
// released model vendor).
//   eras     era ids the mail can arrive in; without it, any era whose text checks pass
//   from     { name, org } pools: one is picked per mail
//   subject, body   variants; body paragraphs split on a blank line
const N = B.mail;
const AI_ERAS = ['chatgbt', 'agents', 'consolidation', 'plateau'];
const NET_ERAS = ['dotcom', 'web2', 'classic', ...AI_ERAS];

// Read-only mail: spam that got past the filter, and the outside world saying things. No options, no effects.
export const AMBIENT = [
  // Spam
  { id: 'spam_prince', category: 'spam', eras: ['dotcom', 'web2', 'classic'],
    from: [{ name: 'Prince Adebayo III', org: null }, { name: 'Barrister J. Okonkwo, Esq.', org: null }],
    subject: ['URGENT AND CONFIDENTIAL BUSINESS PROPOSAL', 'Kindly assist with a transfer of $14,500,000'],
    body: ['Dearest Esteemed {company},\n\nI am writing to you with utmost trust, having found your company in a directory of companies. A sum of money requires a home. Your home has been selected.\n\nKindly reply with your bank details and a recent photograph of the bank.'] },
  { id: 'spam_domain', category: 'spam', eras: NET_ERAS,
    from: [{ name: 'Domain Renewal Services', org: 'DRS Registry Solutions' }],
    subject: ['FINAL NOTICE: {company}.com expires in 3 days', 'Your domain listing is about to lapse'],
    body: ['Your domain listing will expire. This is not an invoice. It looks like an invoice. Please pay it like an invoice.\n\nFailure to act may result in your domain continuing to work exactly as it does now.'] },
  { id: 'spam_seo', category: 'spam', eras: ['web2', 'classic', ...AI_ERAS],
    from: [{ name: 'Rahul', org: 'Top Rank SEO Experts' }, { name: 'Jessica', org: 'Page One Guaranteed' }],
    subject: ['Your website is not ranking for important keywords', 'Re: Your website (quick question)'],
    body: ['Hello Webmaster,\n\nI was checking your website and noticed it is not on page one of the search engine for "{product}". We can fix that. We can also fix things that are not broken, at no extra charge.'] },
  { id: 'spam_15min', category: 'spam', eras: ['classic', ...AI_ERAS],
    from: [{ name: 'Brad', org: 'SynergyStack' }, { name: 'Kaylee', org: 'Pipeline Rocket' }],
    subject: ['Quick 15 minutes?', 'Following up on my last 6 emails', 'Did my last email get buried?'],
    body: ['Hi there,\n\nBumping this to the top of your inbox. Do you have 15 minutes this week to talk about how we help companies like {company} do more with less?\n\nIf you are not the right person, could you point me to the right person? If you are the wrong person, could you point me to another wrong person?'] },
  { id: 'spam_ai_outreach', category: 'spam', eras: AI_ERAS,
    from: [{ name: 'Alex', org: 'GrowthLoopz AI' }, { name: 'Jordan', org: 'OutreachOtter' }],
    subject: ['Loved what {companyTypo} is doing!', 'A personalized note for {companyTypo}'],
    body: ['Hi {companyTypo} team,\n\nI hope this email finds you well. I was truly inspired by your recent work on [PRODUCT NAME]. As a leader in [INDUSTRY], you surely know the importance of [PAIN POINT].\n\nWould you be open to a quick chat?\n\nThis email was written with care. And with a language model.'] },
  { id: 'spam_agent_to_agent', category: 'spam', eras: ['agents', 'consolidation', 'plateau'],
    from: [{ name: 'Procurement Agent #4471', org: 'VendorBot Cloud' }],
    subject: ['Request for your agent to contact my agent', 'Agent-to-agent handshake pending'],
    body: ['Hello {company} agent,\n\nI am an agent. My human asked me to reach your human, but I was told your human has an agent. Please have your agent schedule a meeting with my agent. Neither human needs to attend.'] },
  { id: 'spam_money_fast', category: 'spam', eras: ['dotcom'],
    from: [{ name: 'Opportunity Knocks', org: null }],
    subject: ['MAKE MONEY FAST!!! (not a pyramid)', 'You have been selected for a FREE homepage!!!'],
    body: ['FRIEND,\n\nThe information superhighway has an on-ramp and YOU are standing next to it. Send $20 to the five names below. Then add your own name. This is legal in at least one state.'] },

  // The outside world
  { id: 'investor_update', category: 'investor', needs: 'preseed',
    from: [{ name: 'Morgan Hale', org: 'Hale Ventures' }],
    subject: ['Checking in', 'Quick question about the numbers', 'Saw your launch!'],
    body: ['Hi! Just checking in. No pressure. I read your last update twice. The second time I was smiling. The first time I was confused.\n\nKeep going. Let me know if I can intro you to anyone. I know a guy who knows a guy who once met a guy.'] },
  { id: 'family_update', category: 'investor', needs: 'family',
    from: [{ name: 'Aunt Linda', org: null }, { name: 'Uncle Ray', org: null }],
    subject: ['How is the company doing?', 'Saw you on the computer!', 'Quick question (not about the money)'],
    body: ['Hi sweetie! Just checking in. Your cousin says companies like yours are doing very well right now. Is that you?\n\nNo pressure about the money. We are just curious. Also we told everyone at church.'] },
  { id: 'customer_love', category: 'customer', needs: 'product',
    from: [{ name: 'Dana Whitfield', org: null }, { name: 'Sam Osei', org: null }, { name: 'Priya Natarajan', org: null }],
    subject: ['I just wanted to say thank you', '{product} saved my week'],
    body: ['I never write emails like this. I use {product} every day and it just works. My manager thinks I am a genius now. Please never change anything. Please also add dark mode.'] },
  { id: 'rival_note', category: 'rival', needs: 'rival',
    from: [{ name: '{rivalFounder}', org: '{rival}' }],
    subject: ['Congrats!', 'Love what you are doing over there'],
    body: ['Hey! Huge congrats on the progress. It is so brave to build something that small in a market this big.\n\nWe should grab coffee. I would love to hear how you do it on that budget.'] },
  { id: 'conference_invite', category: 'event',
    from: [{ name: 'SaaSCon Team', org: 'SaaSCon' }],
    subject: ['You are invited to speak at SaaSCon (pay to speak)', 'Last chance: early bird tickets'],
    body: ['We would love to feature {company} on our main stage. Speaking slots start at $12,000 and include a lanyard.\n\nThis year\'s theme: "The Future of the Future".'] },
  { id: 'memo_fax', category: 'staff', eras: ['preinternet'],
    from: [{ name: 'Facilities', org: null }],
    subject: ['MEMO: The fax machine', 'MEMO: Please stop taping things to the copier'],
    body: ['To all staff:\n\nThe fax machine is for faxes. It is not for warming lunch, and it is not a scanner, no matter how hard you press the glass.\n\nThank you,\nFacilities'] },
];

// Actionable templates: options with a label and a hint, effects in decision keys (applied to what the
// mail is about: the staff member, the product or a founder; null for none). reply: the founder's sent text;
// line: what the staff subject says about it in Yak.
// ignored: effects when nobody answers before it expires or it is archived; never a departure.
export const MAIL_TEMPLATES = [
  { id: 'job_application', category: 'applicant', needs: 'product', about: null,
    from: [{ name: 'Taylor Brooks', org: null }, { name: 'Ana Ferreira', org: null }, { name: 'Wei Zhang', org: null }, { name: 'Kofi Mensah', org: null }],
    subject: ['Application: anything, really', 'Huge fan, would love to work at {company}'],
    body: ['Hello,\n\nI have used {product} since the beta and I have opinions. Some of them are good. I would love to work with you, in any role, at any desk, including a bad one.\n\nResume attached. It is one page. It was two pages but I believe in shipping.'],
    options: [
      { label: 'Invite them to interview', hint: 'One candidate joins the hiring pool', effects: { candidates: 'single' }, reply: 'Thanks for writing! Come in next week and meet the team.' },
      { label: 'Polite no', hint: 'Nothing happens', effects: {}, reply: 'Thank you for reaching out. We are not hiring for this right now, but keep building.' },
    ],
    ignored: { effects: {} } },
  { id: 'vendor_pitch', category: 'vendor', about: 'founder',
    from: [{ name: 'Chad Merrick', org: 'CloudScalr' }, { name: 'Erin Park', org: '{model} Enterprise' }],
    subject: ['Unlock 10x productivity with {model}', 'Your team deserves better tooling'],
    body: ['Hi! Companies like {company} are switching to us and seeing results. Which results? Great ones.\n\nCan I steal 15 minutes for a demo? I will bring slides. Many slides.'],
    options: [
      { label: 'Take the 15 minutes', hint: 'Institutional knowledge up a little; a founder\'s strain up a little', effects: { ik: N.pitchKnowledge, strain: N.pitchStrain }, reply: 'Fine. Fifteen minutes. I am setting a timer.' },
      { label: 'Unsubscribe', hint: 'Nothing happens', effects: {}, reply: 'Please remove us from your list.' },
    ],
    ignored: { effects: {} } },
  { id: 'customer_complaint', category: 'customer', needs: 'product', about: 'product', important: true,
    from: [{ name: 'R. Kowalski', org: null }, { name: 'Jen Alvarez', org: null }],
    subject: ['{product} ate my data (again)', 'Extremely disappointed', 'Cancelling unless someone answers'],
    body: ['I have been a loyal customer for weeks. Today {product} logged me out four times and then emailed me to ask how I was enjoying {product}.\n\nI would like a refund, an apology, and to be left alone, in that order.'],
    options: [
      { label: 'Refund and apologise', hint: `-$${N.refund.toLocaleString('en-US')}; brand up a little`, effects: { cash: -N.refund, brand: N.refundBrand }, reply: 'You are right, and we are sorry. Your refund is on its way.' },
      { label: 'Ship a fix', hint: 'The product\'s health up; output down a little for 1 week', effects: { modifier: { key: 'output', value: N.fixOutput, weeks: 1, label: 'Fixing a complaint' }, health: N.fixHealth }, reply: 'Thank you for the detail. A fix is going out this week.' },
    ],
    ignored: { effects: { brand: N.complaintIgnoredBrand } } },
  { id: 'recruiter_poach', category: 'recruiter', needs: 'staff', about: 'staff',
    from: [{ name: 'Brittany', org: 'TalentHunt Partners' }, { name: 'Marcus', org: 'Apex Talent Fishing' }],
    subject: ['Confidential opportunity for {staff}', 'Is {staff} open to new roles?'],
    body: ['Hi there! I came across {staff}\'s profile and was blown away. I know this is a little awkward since you are their employer. I have a role that pays more, has a slide, and a CEO who "gets it".\n\nCould you pass this along? No pressure. Some pressure.'],
    options: [
      { label: 'Tell {staff} about it', hint: 'Their meaning up', effects: { meaning: N.poachTellMeaning }, reply: 'Forwarding this to {staff}. They can decide.', line: ['I would never. But thank you for telling me. That means a lot.', 'A slide? Tempting. I am staying. Mostly for the people.'] },
      { label: 'Counter with a raise', hint: `Their salary up ${N.poachRaisePct}%; their meaning up a little`, effects: { salaryPct: N.poachRaisePct, meaning: N.poachRaiseMeaning }, reply: 'No thanks. We are giving {staff} a raise instead.', line: ['Wait, I got a raise because someone else wanted me? I love recruiters now.'] },
    ],
    ignored: { effects: { strain: N.poachIgnoredStrain } } },
  { id: 'partnership_offer', category: 'partner', needs: 'product', about: 'product', minWeek: 26,
    from: [{ name: 'Lena Fischer', org: 'Bridgely' }, { name: 'Omar Haddad', org: 'Socketly' }],
    subject: ['Partnership: {product} x {org}', 'Integration proposal'],
    body: ['Hi! Our users keep asking for a {product} integration. We would love to build one together and announce it with a joint blog post nobody reads but everybody shares.'],
    options: [
      { label: 'Build the integration', hint: 'Hype up; output down a little for 2 weeks', effects: { hype: N.partnerHype, modifier: { key: 'output', value: N.partnerOutput, weeks: 2, label: 'Partner integration' } }, reply: 'Let us do it. Sending you API keys and a long list of caveats.' },
      { label: 'Pass for now', hint: 'Nothing happens', effects: {}, reply: 'Thanks! Not right now, but keep in touch.' },
    ],
    ignored: { effects: {} } },
];

// Senders for events delivered as mail. ignore: the choice that applies when nobody answers, the event's mildest
// (no cost, no item or pet); events without choices arrive as read-only notices.
export const EVENT_MAIL = {
  alumni_referral: { category: 'staff', from: { name: '{alum}', org: null }, ignore: 0 },
  blockchain_pitch: { category: 'partner', from: { name: 'Kyle', org: 'Chain of Value' }, ignore: 0 },
  vendor_new_version: { category: 'vendor', from: { name: 'Product Updates', org: 'Your model vendor' }, ignore: 1 },
  app_store_rejection: { category: 'legal', from: { name: 'App Review', org: 'App Marketplace Review Board' }, important: true, ignore: 0 },
  vendor_price_hike: { category: 'vendor', from: { name: 'Billing', org: 'Your model vendor' } },
  analyst_report: { category: 'event', from: { name: 'Research Desk', org: 'Quadrant Analyst Group' } },
  vendor_outage: { category: 'vendor', from: { name: 'Status Updates', org: 'Your model vendor' }, important: true },
  bootcamp_grads: { category: 'applicant', from: { name: 'Career Services', org: 'Ten Week Code Academy' } },
};

// The reply-all storm: an all-company thread that grows every week until someone mutes it or it burns out.
export const REPLY_ALL = {
  to: ['everyone@{companySlug}.com', 'all-staff@{companySlug}.com'],
  subjects: ['Who took my oat milk', 'Fridge cleanup this Friday', 'Parking lot is closed Tuesday', 'Someone left a lanyard in room B'],
  agentSubjects: ['Automated notice: kitchen inventory', 'Agent summary of the fridge situation'],
  root: ['Hi all, quick one. {subjectLine}. Please let me know. Thanks!'],
  replies: ['Please remove me from this list.', 'Same.', '+1, please remove me too.', 'Why am I on this?', 'Stop replying all.', 'Can everyone stop replying all?', 'Unsubscribe', 'Sent from my phone. Please remove me.', 'Is this about the oat milk?'],
  agentReplies: ['Acknowledged. Replying to all to confirm receipt.', 'I have summarized this thread for all recipients. Summary: please remove me.'],
  options: [
    { label: 'Reply all: "Please stop replying all"', hint: 'The thread runs one more week; output down a little for 1 week', reply: 'Please stop replying all.' },
    { label: 'Mute the thread', hint: 'It ends', reply: null },
  ],
  callback: ['The founder is replying all again. Brace.', 'Founder reply-all count is now on the whiteboard.'],
};

// The name as an AI writer misspells it.
export const typoName = (name) => (name.length > 4 ? name.slice(0, 2) + name[3] + name[2] + name.slice(4) : `${name}co`);
