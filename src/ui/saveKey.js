// A key for UI records kept per saved company. Save slots are reused (the first free one, or the
// oldest when all are taken), so the slot alone could hand one company another's record; the seed
// and company name tell companies apart. Null before the first save gives the company a slot.
export const companyKey = (s) => (s?.flags?.saveSlot ? `${s.flags.saveSlot}:${s.seed ?? ''}:${s.companyName ?? ''}` : null);
