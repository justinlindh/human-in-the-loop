// Read once when the UI loads. Saved companies and sim callers keep their chosen start.
export const erasPreview = new URLSearchParams(globalThis.location?.search ?? '').has('eras');
