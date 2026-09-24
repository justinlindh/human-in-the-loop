// How the company is funded. cash and scoreMult live in B.funding; this is the words.
export const FUNDING = {
  bootstrapped: {
    id: 'bootstrapped', name: 'Bootstrapped',
    desc: 'Your savings and a credit card. Nobody to answer to, and a full score if you make it.',
    pressure: 'No outside pressure. Also no safety net.',
  },
  family: {
    id: 'family', name: 'Friends and Family',
    desc: 'More runway from people who love you. Score x0.9.',
    pressure: 'Every so often, someone at dinner asks how the company is doing.',
  },
  preseed: {
    id: 'preseed', name: 'Pre-seed VC',
    desc: 'A real check from a real fund. Score x0.8.',
    pressure: 'Investors push for growth now and for automation later. They have a deck about it.',
  },
};

export const FUNDING_IDS = Object.keys(FUNDING);
