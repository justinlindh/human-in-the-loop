// Text for staging the renderer may not draw yet. While a variant's `live` is false its moment keeps its
// default text; setting it true (once the staging ships) swaps in the caption and event text and adds the lines.

// open_plan_office: a parody leader drones on the all-hands screen until the hammer shatters it.
export const ALLHANDS_SCREEN = {
  live: false,
  caption: 'The all-hands screen drones on about alignment. Someone has a hammer.',
  text: '{name} wants an open-plan office. "Collaboration!" On the all-hands screen, a face is droning about synergy. The walls are not structural. Neither, it turns out, is the plan.',
  open: [
    "He's said 'synergy' eleven times. I'm counting.",
    'Is the all-hands mandatory or just inescapable?',
    "Don't blink. The screen counts blinks as disengagement.",
  ],
  // Added to each choice's pool, in EVENTS choice order.
  choices: [
    ["Well, that's one way to flatten the org chart.", 'The all-hands is now an all-pieces.'],
    ['The walls survived. The screen did not.', "I'll file a ticket for the screen. Low priority."],
  ],
};

// The variant's value when it is live, the default otherwise.
export const variantText = (variant, live, fallback) => (variant.live ? live : fallback);

// A talk pool with the variant's lines added in front when it is live.
export function variantPool(variant, pool) {
  if (!variant.live) return pool;
  return { open: [...variant.open, ...pool.open], choices: pool.choices.map((lines, i) => [...(variant.choices[i] ?? []), ...lines]) };
}
