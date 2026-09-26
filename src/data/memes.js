// Image memes for Yak: classic formats redrawn with the game's own characters. The UI maps `image` to its
// files; `alt` is the post's text, for the event stream, accessibility, and when an image is missing.
//   when  the moment a meme fits: 'any', 'outage' (an outage is on),
//         'agents' (the Agents era or later)
export const MEMES = [
  { id: 'this_is_fine', image: 'this_is_fine', when: 'outage',
    alt: 'A founder calmly sips coffee while the whole office burns: "SEV-1. Everything is fine."' },
  { id: 'two_buttons', image: 'two_buttons', when: 'any',
    alt: 'A founder facepalms over two big buttons: "Ship on Friday" and "Sleep".' },
  { id: 'tabs_chart', image: 'tabs_chart', when: 'any',
    alt: 'A chart going up and to the right, labelled "tabs I have open", and a very proud designer.' },
  { id: 'always_config', image: 'always_config', when: 'any',
    alt: 'An engineer and a colleague: "Wait, it\'s all config?" "Always has been."' },
  { id: 'yes_no_tests', image: 'yes_no_tests', when: 'agents',
    alt: 'An engineer waves off "writing the tests myself" and beams at "asking the agent to write them".' },
  { id: 'expanding_review', image: 'expanding_review', when: 'agents',
    alt: 'An engineer getting brighter: "I write code", "I review code", "I review what the agent wrote".' },
];

export const MEME_IDS = MEMES.map((m) => m.id);
