// Era starts are on for everyone; `?eras=0` (or `off`, `false`) hides the picker and its labels.
// Read once when the UI loads. Saved companies and sim callers keep their chosen start.
const value = new URLSearchParams(globalThis.location?.search ?? '').get('eras');
export const erasPreview = !['0', 'off', 'false'].includes(value);
