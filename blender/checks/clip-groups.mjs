// Which clip groups run where, so a group can never be skipped without a word (used by clip.mjs).

// Groups that open their own scene; every other registered group runs on a fresh floor-office page.
export const OWN_PAGE = ['garage', 'celebrations', 'respond', 'control'];

export const mainGroups = (groups) => Object.keys(groups).filter((g) => !OWN_PAGE.includes(g));

// The groups that were wanted but produced no case at all: a group registered without a runner, or a
// runner that returned nothing. `resultsBy` maps a group to the cases it returned.
export const emptyGroups = (wanted, resultsBy) => wanted.filter((g) => !(resultsBy[g]?.length));
