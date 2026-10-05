// Which clip groups run where, so a group can never be skipped without a word (used by clip.mjs and
// scripts/studio/clip.mjs).
import { OWN_PAGES, ERA_SEATS } from './clip-pages.js';

// Each group of checks and the names of its cases (the fixed part; desk, head and use cases add ids).
export const GROUPS = {
  pets: ['moment:pet:'],
  robot: ['moment:robot:'],
  seats: ['desks:all-seated', 'desk:', 'head:'],
  perks: ['couch:sit', 'couch:nap', 'beanbag:sprawl', 'napPod:lie', 'arcade:stool', 'library:armchair'],
  dance: ['dance:motivational_polka', 'dance:corporate_synthwave', 'dance:aggressive_bossa_nova', 'dance:sad_lofi', 'dance:trackLength'],
  walk: ['walk:dropOnWalk', 'walk:dropOnStand', 'walk:walkers'],
  props: ['prop:dropOnWalk', 'prop:dropOnStand', 'moment:pizza', 'prop:groupOnMovedTable', 'moment:hammer', 'moment:letter', 'moment:printer', 'moment:visitor:flinch', 'moment:visitor:explain', 'moment:behind-card', 'moment:prompt-stage', 'prop:stageStaff', 'prop:pivotBoard', 'moment:letter-claim', 'moment:letter-lifecycle'],
  y2k: ['moment:y2k', 'prop:y2k-printer-isolation'],
  pairs: ['pairs:floor'],
  use: ['use:espresso', 'use:coffee_corner', 'use:plant_wall', 'use:bookshelf'],
  party: ['waffle:crowd'],
  sky: ['sky:trailing'],
  garage: ['pairs:garage'],
  celebrations: ['moment:growth', 'moment:company_party', 'moment:deal'],
  respond: ['moment:respond:rack', 'moment:respond:desk'],
  control: ['control:head-through-slab'],
  // The seated checks in each founded era's office.
  ...Object.fromEntries(ERA_SEATS.map(([era]) => [`era-${era}`, [`era:${era}:`]])),
};

// Groups that open their own scene; every other registered group runs on a fresh floor-office page.
export const OWN_PAGE = Object.keys(OWN_PAGES);

export const mainGroups = (groups) => Object.keys(groups).filter((g) => !OWN_PAGE.includes(g));

// The groups that were wanted but produced no case at all: a group registered without a runner, or a
// runner that returned nothing. `resultsBy` maps a group to the cases it returned.
export const emptyGroups = (wanted, resultsBy) => wanted.filter((g) => !(resultsBy[g]?.length));

// Which groups an --only filter reaches: a pattern reaches a group when it is part of one of the
// group's case names, or starts with one (`desk:f3` reaches seats through `desk:`).
export const groupsFor = (only) => Object.fromEntries(Object.entries(GROUPS).map(([g, names]) => [g, !only || only.some((p) => names.some((n) => n.includes(p) || p.startsWith(n)))]));
