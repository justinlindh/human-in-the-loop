// Image memes for Yak: classic formats redrawn with the game's own characters. The UI maps `image` to its
// files; `alt` is the post's text, for the event stream, accessibility, and when an image is missing.
//   when  the moment a meme fits: 'any', 'outage' (an outage is on),
//         'chatbots' (the ChatGBT era or later), 'agents' (the Agents era or later)
export const MEMES = [
  { id: 'this_is_fine', image: 'this_is_fine', when: 'outage',
    alt: 'A founder calmly sips coffee while the whole office burns: "SEV-1. Everything is fine."' },
  { id: 'two_buttons', image: 'two_buttons', when: 'any',
    alt: 'A founder is torn between two big buttons: "Ship on Friday" and "Sleep".' },
  { id: 'tabs_chart', image: 'tabs_chart', when: 'any',
    alt: 'A chart going up and to the right, labelled "tabs I have open", and a very proud designer.' },
  { id: 'always_config', image: 'always_config', when: 'any',
    alt: 'An engineer and a colleague: "Wait, it\'s all config?" "Always has been."' },
  { id: 'yes_no_tests', image: 'yes_no_tests', when: 'agents',
    alt: 'An engineer waves off "writing the tests myself" and beams at "asking the agent to write them".' },
  { id: 'expanding_review', image: 'expanding_review', when: 'agents',
    alt: 'An engineer getting brighter: "I write code", "I review code", "I review what the agent wrote".' },
  { id: 'is_this_agi', image: 'is_this_agi', when: 'chatbots',
    alt: 'A founder points at an autocomplete bubble and asks: "Is this AGI?"' },
  { id: 'distracted_founder', image: 'distracted_founder', when: 'chatbots',
    alt: 'A founder beside "our actual product" turns to stare at a passing "new AI feature". "Priorities".' },
  { id: 'the_bill', image: 'the_bill', when: 'chatbots',
    alt: 'A founder reads a cloud bill: $41,000.04, mostly GPU hours and tokens, for 12 users. "Month one".' },
  { id: 'the_plan', image: 'the_plan', when: 'agents',
    alt: 'The plan, on a whiteboard: "1. Add AI. 2. Raise a round. 3. The product is the AI. 4. The AI is the PM."' },
];

export const MEME_IDS = MEMES.map((m) => m.id);
