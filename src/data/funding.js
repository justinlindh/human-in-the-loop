// How the company is funded. cash, scoreMult, and the starting perks live in B.funding; this is the words.
export const FUNDING = {
  bootstrapped: {
    id: 'bootstrapped', name: 'Bootstrapped',
    desc: 'About $110k of savings and a credit card. Nobody to answer to, and a full score if you make it.',
    pressure: 'No outside pressure. Also no safety net.',
  },
  family: {
    id: 'family', name: 'Friends and Family',
    desc: 'About $150k from people who love you: more runway, fewer panicked weeks. Score x0.97.',
    pressure: 'Every so often, someone at dinner asks how the company is doing.',
  },
  preseed: {
    id: 'preseed', name: 'Pre-seed VC',
    desc: 'About $300k, a little press, and intros to two senior candidates who would never look at a garage otherwise. Score x0.96.',
    pressure: 'Investors push for growth now and for automation later. They have a deck about it.',
  },
};

export const FUNDING_IDS = Object.keys(FUNDING);
