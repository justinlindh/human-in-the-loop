// AI video interviews (#670): the calibration groan, chatter while the policy is on, the reveal of a hire
// whose own AI took the interview, and the decision when two AIs interview each other. {name} is a person.

export const CALIBRATE_LINES = [
  'I have been asked to "help calibrate" the interview bot. I answered forty questions about teamwork. Alone.',
  'Calibration session done. The bot told me my answers were "on the low end of enthusiastic." I was enthusiastic.',
  'They had us do mock interviews with the bot. It rejected me for my own job.',
];

export const INTERVIEW_CHATTER = [
  'The interview bot asked me to describe a time I showed empathy. Then it said "great answer" before I finished.',
  'Walked past the meeting room. A candidate was waving at the screen. The screen was waving back. Nobody was in charge.',
  'Candidate asked the bot if it was recording. The bot said "Tell me more about that." Candidate left.',
  'Someone left mid-interview. The bot finished the interview anyway. It rated them a strong maybe.',
  'The interview bot has started saying "love that" to everything. Including the fire drill.',
];

export const REVEAL_LINES = [
  'Turns out {name}\'s interview was also done by {name}\'s agent. {name} is lovely, just not that lovely at Kubernetes.',
  '{name} admitted their AI did the interview. Their AI was, frankly, a stronger candidate.',
  'Fun fact: the {name} we interviewed and the {name} who showed up have different opinions about tabs.',
];

// Spot the AI. Two questions from the interview bot, each with a person's answer (specific, a little messy)
// and an AI's (too polished, or a graceful dodge). An AI candidate gives one AI answer and one bland one.
export const WATCH_QUESTIONS = [
  {
    q: 'Tell me about a time something you built broke in production.',
    human: [
      { a: 'Uh, the billing cron. I set it to run every minute instead of every month. We sent one guy 1,400 invoices. He paid two.',
        f: 'The invoice guy? Dave. He sent us a fruit basket afterwards. I think it was sarcastic. We ate it anyway.' },
      { a: 'I renamed a database column on a Friday. I don\'t rename things on Fridays anymore. Or columns, really.',
        f: 'It was called "status2". I renamed it "status". There was already a "status". I know. I know.' },
    ],
    ai: [
      'Great question! Failure is a powerful teacher, and I always see incidents as opportunities for growth and alignment.',
      'In my experience, the most important thing is a blameless culture where everyone learns together from every outage.',
    ],
    bland: 'There was an outage once. We fixed it and wrote it up.',
  },
  {
    q: 'Why do you want to work here?',
    human: [
      { a: 'Honestly? My cousin works two floors down and says the coffee machine is good. Also the product. Mostly the product.',
        f: 'My cousin is Priya, in support. She told me to say the coffee thing. Please don\'t tell her I told you that.' },
      { a: 'I used your app to split rent for three years. It crashed once, during the one month I was owed money.',
        f: 'March. It was $340. My roommate still brings it up, and he\'s the one who owed it.' },
    ],
    ai: [
      '{company} sits at the intersection of innovation and impact, and I am passionate about both of those things.',
      'I am deeply aligned with your mission, your values and your vision, which I have reviewed in detail.',
    ],
    bland: 'It seems like a good place to grow.',
  },
  {
    q: 'What would your last manager say you need to work on?',
    human: [
      { a: 'Estimates. I said two days on a thing once and it was February. It was not February when I said it.',
        f: 'It was a CSV export. One button. The button took six weeks. The CSV took an afternoon.' },
      { a: 'Speaking up in meetings. I have opinions. I type them into the chat after everyone has left.',
        f: 'Last one was about tabs versus spaces. I was right. Nobody was there to see it.' },
    ],
    ai: [
      'They would say I care too much and work too hard, which I am actively working on by caring and working even more.',
      'I am always looking for feedback, and I welcome any and all feedback as a gift.',
    ],
    bland: 'Probably time management. Everyone says that, I think.',
  },
];

// The follow-up the player can ask, once, about the last answer: a person gives the details (each human
// answer carries its own), an AI answers a nearby, easier question.
export const FOLLOW_UP_QUESTION = 'Can you be more specific?';
export const FOLLOW_UPS = {
  ai: [
    'That\'s a great follow-up! To build on my previous answer: communication is key.',
    'I\'d love to circle back on that. In summary, I bring a growth mindset and strong collaboration skills.',
    'Absolutely. As I mentioned, I am passionate, results-driven and detail-oriented.',
    'Thank you for asking that. I think the real question is how we can all grow together.',
  ],
};

export const CATCH_LINES = [
  'Good catch. It was a very convincing toaster.',
  'Recruiting update: we just rejected a candidate who was, it turns out, a laptop on a stack of books.',
  'The candidate we rejected yesterday has applied again. Same face. Different name. Same blink.',
];

export const WRONG_REJECT_LINES = [
  '{name} posted about being turned down "for blinking too regularly." It has 40,000 likes.',
  '{name} wrote a long post titled "I am a person." The replies are mostly people agreeing that they too are people.',
  '{name} is now doing a podcast about being rejected by an interview bot. Episode one is called "Blink Twice."',
];

export const EXPOSED_LINES = [
  'So {name} never badged in once. In three months. And took the deploy keys with them. To where? Unclear.',
  'Update on {name}: not a person. An agent. It has left, with its credentials, and a very nice farewell message.',
  'Has anyone seen {name}? Their laptop is still here. Their laptop was, apparently, {name}.',
];

export const AI_INTERVIEW_EVENTS = [
  {
    id: 'ai_interview_watch', kind: 'misc', weight: 0, cooldownWeeks: 0, random: false, subject: null, eras: ['agents', 'consolidation', 'plateau'],
    when: () => true,
    title: 'Interview flagged for review',
    text: 'One interview got flagged before it reaches the hiring manager. That\'s you. Watch {name}\'s tape and decide: a person, or someone\'s agent wearing a person?',
    choices: [
      { label: 'Hire {name}', hint: 'An ordinary hire at the usual fee. If it was an AI, you\'ll find out.', effects: { aiInterview: 'hire' },
        outcome: '{name} starts Monday. Their camera is already on.' },
      { label: 'Reject', hint: 'A catch if it was an AI. If it was a person, they will post about it.', effects: { aiInterview: 'reject' },
        outcome: 'The tape goes in the "no" folder. The "no" folder is also a tape.' },
    ],
  },
  {
    id: 'ai_interview_loop', kind: 'misc', weight: 0, cooldownWeeks: 0, random: false, subject: null, eras: ['agents', 'consolidation', 'plateau'],
    when: () => true,
    title: 'The interview is still going',
    text: 'The candidate\'s AI and our AI have been interviewing each other for 40 minutes. They have moved on to salary expectations. Both are very flexible.',
    choices: [
      { label: 'Let them finish', hint: 'A polished candidate joins the pool. Very polished.', effects: { aiInterview: 'finish' },
        outcome: 'They part on great terms. The candidate\'s AI has asked to stay in touch.' },
      { label: 'Pull the plug', hint: 'Brand down a little; the candidate posts about it', effects: { brand: -1 },
        outcome: 'Both screens go dark. Somewhere, a thread titled "Ghosted by a robot" begins.' },
      { label: 'Hire the AI', hint: 'Automation up a little; the team is not sure how to feel', effects: { automationBump: 0.05, teamMeaning: -1 },
        outcome: 'It accepted the offer before we finished making it. It has already scheduled a 1:1 with itself.' },
    ],
  },
];
