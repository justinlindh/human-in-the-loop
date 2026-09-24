// Purpose: what the company is for, set by a mission decision once agents arrive, and tested by later
// decisions. Keeping faith with the mission raises it; breaking it lowers it.
export const PURPOSE_INFO = {
  name: 'Purpose',
  affects: 'People recover meaning faster and quit less when Purpose is high. In the Plateau it also draws better candidates and makes customers trust your products.',
  missions: {
    craft: { id: 'craft', name: 'Make software people love', blurb: 'Care and polish. Automating the craft away will cost it.' },
    people: { id: 'people', name: 'A place where people grow', blurb: 'Mentoring and juniors. Replacing people with agents will cost it.' },
    trust: { id: 'trust', name: 'The company customers trust', blurb: 'Reliability and honesty. Hype and shortcuts will cost it.' },
    growth: { id: 'growth', name: 'Grow as fast as the tools allow', blurb: 'Starts lower. Automation keeps faith with it; nothing else moves it much.' },
  },
};
