import { ITEMS as clips } from './manifest.mjs';
export const ITEMS = clips.map(item => ({ ...item, still: true, screenshots: [650], fps: 30 }));
