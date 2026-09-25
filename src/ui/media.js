// The phone layout: a narrow screen, or a short one on a touch device (a phone on its side). A
// short desktop window with a mouse keeps the desktop layout. The phone stylesheets use the same query.
export const PHONE_QUERY = '(max-width: 480px), (max-height: 500px) and (pointer: coarse)';
export const phoneLayout = () => typeof matchMedia === 'function' && matchMedia(PHONE_QUERY).matches;
// Touch input (a coarse pointer): copy says Tap, and keyboard hints hide.
export const touchUI = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
export const phoneMedia = () => (typeof matchMedia === 'function' ? matchMedia(PHONE_QUERY) : { matches: false });
