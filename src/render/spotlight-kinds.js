// The render lane's spotlight policy. Durations are presentation estimates for the pacing tool;
// a live scene ends from its actors, and may supply a more precise expectedSeconds.
export const MOMENT_KINDS = {
  printer_jam: { spotlight: true, seconds: 22, zoom: 1.8 },
  first_user_test: { spotlight: true, seconds: 12, zoom: 2 },
  efficiency_consultants: { spotlight: true, seconds: 12, zoom: 2 },
  open_plan_office: { spotlight: true, seconds: 3.3, zoom: 2 },
  waffle_party: { spotlight: true, seconds: 16, zoom: 1.6 },
  music_night: { spotlight: true, seconds: 90, zoom: 1.6 },
  letter: { spotlight: true, seconds: 8, zoom: 2, caption: 'An envelope, a deep breath, and some unwelcome news.' },
  fumes: { spotlight: true, seconds: 8, zoom: 2, caption: 'Something is smoking. Someone has volunteered to fan it.' },
  pizza: { spotlight: true, seconds: 8, zoom: 1.8, caption: 'Pizza has arrived. The work can wait a moment.' },
  carrier: { spotlight: true, seconds: 8, zoom: 2, caption: 'There is someone new in the carrier.' },
  screen: { spotlight: true, seconds: 3, zoom: 1.8, caption: 'Every screen has bad news.' },
  company_party: { spotlight: true, seconds: 3, zoom: 1.6, caption: 'A win for the company. Take a moment to celebrate.' },
  promotion: { spotlight: true, seconds: 6, zoom: 2, caption: 'A new career path. The team takes a moment to celebrate.' },
  legend: { spotlight: true, seconds: 6, zoom: 2, caption: 'A company legend. The team knows who to thank.' },
  top_level: { spotlight: true, seconds: 6, zoom: 2, caption: 'The top level. That deserves a round of applause.' },
  standup: { spotlight: false },
  coffee: { spotlight: false },
  pair: { spotlight: false },
};
