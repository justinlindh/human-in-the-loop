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

export const AI_INTERVIEW_EVENTS = [
  {
    id: 'ai_interview_loop', kind: 'misc', weight: 0, cooldownWeeks: 0, random: false, subject: null, eras: ['agents', 'consolidation', 'plateau'],
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
