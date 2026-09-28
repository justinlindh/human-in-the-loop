// Who is away from their own work handling an incident: the outage's responders, and the people
// still writing up the last postmortem. Their assignment is untouched; only their output stops.
export function responding(state, staffId) {
  if (state.outage?.responderIds?.includes(staffId)) return true;
  const pm = state.flags?.postmortem;
  return !!pm && state.week < pm.untilWeek && pm.staffIds.includes(staffId);
}
