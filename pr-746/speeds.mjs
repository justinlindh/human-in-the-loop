import { item } from './manifest.mjs';
export const ITEMS = [2, 4].map(speed => item({ id: `standup-${speed}x`, speed, seconds: 60 }));
