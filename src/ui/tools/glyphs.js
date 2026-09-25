// Source for the UI glyph icons. `node src/ui/tools/build-glyphs.js` writes one SVG per glyph to
// public/icons/glyphs/ plus its manifest. Each glyph is drawn on a 24x24 grid: chunky rounded
// shapes, a thick ink outline, palette colors. Parts filled with currentColor take the CSS color,
// so the UI can tint arrows, stars, and speed controls.

const INK = '#2a2630';
const PAPER = '#fbf5ea';
const C = {
  blue: '#4f8cff', pink: '#ff7eb6', yellow: '#ffb020', green: '#34c38f', red: '#e5484d', purple: '#9b6bff',
  gold: '#e3b04b', wood: '#d39b5d', woodDark: '#8d5d3e', leaf: '#5ea35a', leafLight: '#8fc66e', pot: '#c77b52',
  glass: '#bcdde8', metal: '#b9bcc4', metalDark: '#4d4a55', skin: '#eec29f', blush: '#eea596', cream: '#f0e4cf',
  teal: '#4f8a87', orange: '#e08a3c', screen: '#1e2333', screenBlue: '#62b4ff', coffee: '#5a3a2a', mug: '#f1ebe0',
  alarm: '#ff3b3b', terracotta: '#c7734f', slate: '#6c7589', mustard: '#d8a444',
};

const SW = 2;
const o = `stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round" stroke-linecap="round"`;
const line = (w = SW) => `stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
const rr = (x, y, w, hh, r, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="${r}" fill="${fill}" ${o}/>`;
const circ = (cx, cy, r, fill) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${o}/>`;
const path = (d, fill = 'none') => `<path d="${d}" fill="${fill}" ${o}/>`;
const dot = (cx, cy, r = 1.2, fill = INK) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;

// Faces share a head; features vary.
const head = (fill = C.skin) => circ(12, 12.5, 9, fill);
const cheeks = `<circle cx="7.3" cy="14.6" r="1.4" fill="${C.blush}"/><circle cx="16.7" cy="14.6" r="1.4" fill="${C.blush}"/>`;
const eyes = dot(9, 11, 1.3) + dot(15, 11, 1.3);
const face = (features, fill) => head(fill) + features;

const star5 = (cx, cy, R, r) => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r : R;
    pts.push(`${(cx + Math.cos(a) * rad).toFixed(2)},${(cy + Math.sin(a) * rad).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
};
const sparkle = (cx, cy, s) => `M${cx} ${cy - s}Q${cx + s * 0.18} ${cy - s * 0.18} ${cx + s} ${cy}Q${cx + s * 0.18} ${cy + s * 0.18} ${cx} ${cy + s}Q${cx - s * 0.18} ${cy + s * 0.18} ${cx - s} ${cy}Q${cx - s * 0.18} ${cy - s * 0.18} ${cx} ${cy - s}Z`;
const gear = (cx, cy, R, r, teeth = 8) => {
  const pts = [];
  const pt = (a, rad) => `${(cx + Math.cos(a) * rad).toFixed(2)},${(cy + Math.sin(a) * rad).toFixed(2)}`;
  for (let i = 0; i < teeth; i++) {
    const a = (i * 2 * Math.PI) / teeth;
    const half = Math.PI / teeth;
    pts.push(pt(a - half * 0.45, R), pt(a + half * 0.45, R), pt(a + half * 0.75, r), pt(a + half * 1.25, r));
  }
  return `M${pts.join('L')}Z`;
};

// Reused drawings.
const D = {
  hammer: rr(10.5, 9, 3, 12, 1.5, C.wood) + path('M5 4.5h10.5a3 3 0 0 1 3 3v1.5a1.2 1.2 0 0 1-1.2 1.2H6.2A1.7 1.7 0 0 1 4.5 8.5V5Z', C.metal),
  rocket: path('M12 2.5c3.6 2.4 5 6 4.6 10.3l-1.6 3.7H9l-1.6-3.7C7 8.5 8.4 4.9 12 2.5Z', PAPER)
    + circ(12, 9.5, 2.2, C.screenBlue) + path('M8.6 13.2 5 16.5l.6 3.4 3.6-2.2', C.red) + path('M15.4 13.2l3.6 3.3-.6 3.4-3.6-2.2', C.red)
    + path('M10 16.5 12 21.5l2-5', C.yellow),
  megaphone: path('M4 10v4a1.5 1.5 0 0 0 1.5 1.5H8l9 4.5V4L8 8.5H5.5A1.5 1.5 0 0 0 4 10Z', C.yellow) + path('M8 15.5 9.5 21h2.5L11 16.5', C.cream)
    + `<path d="M19.5 9.5q1.5 2.5 0 5" ${line()}/>`,
  brain: path('M12 5.5C10.5 3.5 6.5 3.8 6 7 3.5 7.5 3 11 5 12.5 3.8 15 5.8 18 8.5 17.5 9.5 20 12 20 12 18.5 12 20 14.5 20 15.5 17.5 18.2 18 20.2 15 19 12.5 21 11 20.5 7.5 18 7 17.5 3.8 13.5 3.5 12 5.5Z', C.pink)
    + `<path d="M12 5.5v13M8.5 9.5q2 .5 3.5 2M15.5 9.5q-2 .5-3.5 2M8 14q2-.5 4 .5M16 14q-2-.5-4 .5" ${line(1.4)}/>`,
  robot: `<path d="M12 2.5v3" ${line()}/>` + circ(12, 2.6, 1.3, C.red) + rr(4.5, 5.5, 15, 13, 4, C.metal)
    + rr(7, 9, 10, 5.5, 2.5, C.screen) + dot(9.8, 11.7, 1.3, C.screenBlue) + dot(14.2, 11.7, 1.3, C.screenBlue)
    + rr(2.5, 10, 2, 4.5, 1, C.metalDark) + rr(19.5, 10, 2, 4.5, 1, C.metalDark) + `<path d="M9.5 16.5h5" ${line(1.6)}/>`,
  shield: path('M12 2.5 19.5 5v6.5c0 5-3.3 8.3-7.5 10-4.2-1.7-7.5-5-7.5-10V5Z', C.red) + path('M12 5.5 17 7.2v4.3c0 3.4-2.1 5.7-5 7Z', '#f06a6e'),
  building: rr(4, 6, 11, 15.5, 1.5, C.cream) + rr(15, 11, 5.5, 10.5, 1.2, C.wood)
    + [7, 10.5].map((x) => [9, 12.5, 16].map((y) => `<rect x="${x}" y="${y}" width="2" height="2" rx=".4" fill="${C.screenBlue}"/>`).join('')).join('')
    + rr(8.2, 18.2, 2.6, 3.3, 0.6, C.woodDark) + path('M3 6h13L12 2.5H7Z', C.terracotta),
  barChart: rr(3, 3, 18, 18, 3, PAPER) + rr(6, 12, 3, 6, 0.8, C.blue) + rr(10.5, 8, 3, 10, 0.8, C.green) + rr(15, 5.5, 3, 12.5, 0.8, C.yellow),
  person: circ(12, 7.5, 4.2, C.skin) + path('M4.5 21c0-4.4 3.4-7.5 7.5-7.5s7.5 3.1 7.5 7.5Z', C.green) + path('M8 5.5q4-3 8 0 0-3-4-3.2-4 .2-4 3.2Z', C.woodDark),
  siren: rr(4, 17.5, 16, 4, 1.5, C.metalDark) + path('M6 17.5V12a6 6 0 0 1 12 0v5.5Z', C.alarm) + `<path d="M9.5 11.5a2.5 2.5 0 0 1 2.5-2.5" stroke="${PAPER}" stroke-width="1.6" stroke-linecap="round" fill="none"/>`
    + `<path d="M3 7 4.8 8.2M21 7l-1.8 1.2M12 2v2" ${line(1.8)}/>`,
  bubble: path('M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4h0A2.5 2.5 0 0 1 4 13.5Z', C.blue)
    + dot(8.5, 9.6, 1.3, PAPER) + dot(12, 9.6, 1.3, PAPER) + dot(15.5, 9.6, 1.3, PAPER),
  flame: path('M12 2.5c1 3.5 5.5 5.5 5.5 11a5.5 5.5 0 0 1-11 0c0-2.3 1-3.6 2-4.6 0 1.6.6 2.7 1.8 3.1C10.3 9 11 5.8 12 2.5Z', C.orange)
    + path('M12 12c.8 1.6 2.6 2.4 2.6 4.6a2.6 2.6 0 0 1-5.2 0c0-1.6 1.6-2.6 2.6-4.6Z', C.yellow),
  heart: path('M12 20.5S3.5 15.3 3.5 9a4.5 4.5 0 0 1 8.5-2.1A4.5 4.5 0 0 1 20.5 9c0 6.3-8.5 11.5-8.5 11.5Z', C.purple),
  trophy: path('M7 3.5h10v5.5a5 5 0 0 1-10 0Z', C.gold) + `<path d="M7 5.5H4.5v1.5A3 3 0 0 0 7.5 10M17 5.5h2.5v1.5a3 3 0 0 1-3 3" ${line()}/>`
    + rr(10.5, 13.5, 3, 3.5, 0.5, C.gold) + rr(7, 17, 10, 4, 1.2, C.woodDark),
  book: path('M3.5 5c3-1 5.5-1 8.5.8v14.7c-3-1.8-5.5-1.8-8.5-.8Z', C.blue) + path('M20.5 5c-3-1-5.5-1-8.5.8v14.7c3-1.8 5.5-1.8 8.5-.8Z', C.teal)
    + `<path d="M6 8.5q2.3-.4 4 .6M6 11.5q2.3-.4 4 .6M14 9.1q1.7-1 4-.6M14 12.1q1.7-1 4-.6" stroke="${PAPER}" stroke-width="1.2" stroke-linecap="round" fill="none"/>`,
  eyes: `<ellipse cx="7.5" cy="12" rx="4.5" ry="5.5" fill="${PAPER}" ${o}/><ellipse cx="16.5" cy="12" rx="4.5" ry="5.5" fill="${PAPER}" ${o}/>` + dot(8.6, 12.8, 2.1) + dot(17.6, 12.8, 2.1),
  gradcap: path('M2.5 9.5 12 5l9.5 4.5L12 14Z', C.metalDark) + path('M6.5 11.5v4.5c3.5 2.5 7.5 2.5 11 0v-4.5L12 14Z', C.slate) + `<path d="M19.5 10.5v5" ${line(1.6)}/>` + dot(19.5, 16.2, 1.3, C.yellow),
  puzzle: path('M4 8h4a2.3 2.3 0 1 1 4 0h4v4a2.3 2.3 0 1 1 0 4v4h-4a2.3 2.3 0 1 0-4 0H4v-4a2.3 2.3 0 1 0 0-4Z', C.purple),
  palm: circ(18, 5.5, 3, C.yellow) + path('M3 21.5q9-3 18 0Z', '#e6c18f') + `<path d="M10.5 21q.5-6-1.5-11" ${line(2.4)}/>`
    + path('M9 10c-3-2-6-.5-6.5 1.5 2-1.2 4.3-1.3 6.5-1.5ZM9 10c1-3 4.5-4 6.5-2.5-2.3.1-4.4.9-6.5 2.5ZM9 10c-1.5-3-.5-6 2-6.5-1.3 2-1.8 4.3-2 6.5Z', C.leaf),
  door: rr(5, 3, 11, 18.5, 1.5, C.wood) + dot(13.3, 12.5, 1.1) + path('M14.5 12h7M18.5 9l3 3-3 3', 'none'),
  box: path('M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4Z', C.wood) + `<path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9" ${line()}/>` + `<path d="M7.8 5.5l8.5 4" stroke="${C.cream}" stroke-width="1.6" fill="none"/>`,
  server: rr(5, 2.5, 14, 19, 2, C.metalDark) + [5.5, 10.5, 15.5].map((y) => `<rect x="7.5" y="${y}" width="9" height="3" rx="1" fill="${C.screen}"/>` + dot(15, y + 1.5, 0.9, '#3ee07a')).join(''),
  magnifier: circ(10, 10, 6, C.glass) + `<path d="M14.5 14.5 20.5 20.5" ${line(3.2)}/>` + `<path d="M7.5 8.5a3 3 0 0 1 2.5-1.8" stroke="${PAPER}" stroke-width="1.5" stroke-linecap="round" fill="none"/>`,
  clipboard: rr(5, 4, 14, 17.5, 2, C.wood) + rr(7, 6.5, 10, 13, 1, PAPER) + rr(9, 2.5, 6, 3.5, 1.2, C.metal)
    + `<path d="M9 11h6M9 14h6M9 17h4" ${line(1.5)}/>`,
  coin: circ(12, 12, 8.5, C.gold) + `<path d="M14.5 9.3c-.6-.8-1.6-1.2-2.6-1.2-1.4 0-2.5.8-2.5 1.9 0 2.6 5.3 1.4 5.3 4 0 1.1-1.2 1.9-2.7 1.9-1.1 0-2.1-.4-2.7-1.2M12 6.5v11" ${line(1.6)}/>`,
  banknote: rr(2.5, 6, 19, 12, 2, C.green) + circ(12, 12, 3, '#6ed8a8') + dot(5.5, 9, 1, PAPER) + dot(18.5, 15, 1, PAPER),
  pencil: path('M5 19l1-4.5L16.5 4a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8L9.5 18Z', C.yellow) + path('M5 19l1-4.5 3.5 3.5Z', C.skin) + `<path d="M14.5 6 18 9.5" ${line()}/>`,
  headset: `<path d="M5 14v-2a7 7 0 0 1 14 0v2" ${line(2.4)}/>` + rr(3, 12.5, 4, 6.5, 1.5, C.green) + rr(17, 12.5, 4, 6.5, 1.5, C.green) + `<path d="M19 19q0 2.5-4 2.5h-1.5" ${line(1.6)}/>` + dot(13, 21.5, 1.3),
  briefcase: rr(3, 7.5, 18, 13, 2.5, C.woodDark) + path('M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5', 'none') + `<path d="M3 13h18" ${line()}/>` + rr(10.5, 11.5, 3, 3, 0.6, C.gold),
  keyboard: rr(2.5, 7, 19, 11, 2.5, C.cream) + [5.5, 9, 12.5, 16].map((x) => `<rect x="${x}" y="9.5" width="2.5" height="2" rx=".5" fill="${C.metalDark}"/>`).join('')
    + [6.5, 10.3, 14.1].map((x) => `<rect x="${x}" y="12.5" width="2.8" height="2" rx=".5" fill="${C.metalDark}"/>`).join('') + `<rect x="7" y="15.3" width="10" height="1.4" rx=".5" fill="${C.metalDark}"/>`,
  testtube: path('M9 2.5h6M10 2.5v14a2 2 0 0 0 4 0v-14', PAPER) + path('M10 11h4v5.5a2 2 0 0 1-4 0Z', C.green) + dot(12.8, 13.8, 0.9, PAPER)
    + path('M15.5 6h4M16.5 6v9a1.5 1.5 0 0 0 3 0V6', C.glass),
  monitor: rr(2.5, 3.5, 19, 13, 2, C.metalDark) + rr(4.5, 5.5, 15, 9, 1, C.screen)
    + `<path d="M6.5 11.5l2.5-2.5 2.5 2 3-3.5 3 2.5" stroke="${C.screenBlue}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` + path('M9 20.5h6M12 16.5v4'),
  signpost: `<path d="M12 21.5v-18" ${line(2.4)}/>` + path('M12 5h7l2 2-2 2h-7Z', C.yellow) + path('M12 11H5l-2 2 2 2h7Z', C.blue),
  compass: circ(12, 12, 9, PAPER) + path('M12 5.5l2.3 6.5-2.3 6.5-2.3-6.5Z', C.red) + path('M12 12l2.3 6.5h0L12 18.5 9.7 12Z', C.metal) + dot(12, 12, 1.3),
  scroll: path('M6 4h11a2.5 2.5 0 0 1 2.5 2.5V18a2.5 2.5 0 0 1-2.5 2.5H8', C.cream) + path('M6 4a2 2 0 0 0-2 2v1.5h4V6a2 2 0 0 0-2-2Z', C.wood)
    + path('M8 6v12.5A2 2 0 0 1 6 20.5a2 2 0 0 1-2-2v-1h4', C.cream) + `<path d="M10.5 8.5h6M10.5 11.5h6M10.5 14.5h4" ${line(1.5)}/>`,
};

// Era emblems: a round badge in the era's colour with its motif.
const ERA_BG = { classic: '#9a6a44', chatgbt: '#2f5fd0', agents: '#0f7f79', consolidation: '#5b5361', plateau: '#c0652b' };
const badge = (era, motif) => circ(12, 12, 10, ERA_BG[era]) + motif;
const EMBLEM = {
  classic: badge('classic', path('M7 10h8v5a3.5 3.5 0 0 1-3.5 3.5h-1A3.5 3.5 0 0 1 7 15Z', C.mug)
    + `<path d="M15 11.2h1a1.9 1.9 0 0 1 0 3.8h-1" stroke="${C.mug}" stroke-width="1.6" fill="none"/>`
    + `<path d="M9.5 8q.8-1.2 0-2.4M12.5 8q.8-1.2 0-2.4" stroke="${C.mug}" stroke-width="1.4" stroke-linecap="round" fill="none"/>`),
  chatgbt: badge('chatgbt', path('M6 8.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-4.5L8.5 18v-2.5H8a2 2 0 0 1-2-2Z', PAPER)
    + dot(9.5, 11, 1.1) + dot(12, 11, 1.1) + dot(14.5, 11, 1.1)
    + `<path d="${sparkle(17.5, 6.2, 2.4)}" fill="${C.yellow}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>`),
  agents: badge('agents', `<path d="M12 5.5v2" stroke="${PAPER}" stroke-width="1.6" stroke-linecap="round"/>` + `<circle cx="12" cy="5.2" r="1.1" fill="${C.red}"/>`
    + rr(6.5, 7.5, 11, 9, 3, C.metal) + rr(8.3, 9.8, 7.4, 3.8, 1.6, C.screen)
    + `<circle cx="10.4" cy="11.7" r="1" fill="${C.screenBlue}"/><circle cx="13.6" cy="11.7" r="1" fill="${C.screenBlue}"/>`
),
  consolidation: badge('consolidation', `<path d="M8.2 9.8 11 14M15.8 9.8 13 14" stroke="${PAPER}" stroke-width="1.8" stroke-linecap="round" fill="none"/>`
    + `<circle cx="7.6" cy="8.2" r="2.4" fill="${C.pink}" stroke="${INK}" stroke-width="1.3"/><circle cx="16.4" cy="8.2" r="2.4" fill="${C.yellow}" stroke="${INK}" stroke-width="1.3"/>`
    + `<circle cx="12" cy="15.6" r="3.2" fill="${C.purple}" stroke="${INK}" stroke-width="1.3"/>`),
  plateau: badge('plateau', `<path d="M5.5 16.5l3-3.6 2.6 1.8h7.4" stroke="${PAPER}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
    + `<path d="M14.8 14.2V5.8" stroke="${PAPER}" stroke-width="1.5" stroke-linecap="round"/>`
    + `<path d="M14.8 5.8h4.6l-1.4 1.9 1.4 1.9h-4.6Z" fill="${C.yellow}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>`),
};

export const GLYPHS = {
  // era emblems
  'era.classic': { d: EMBLEM.classic },
  'era.chatgbt': { d: EMBLEM.chatgbt },
  'era.agents': { d: EMBLEM.agents },
  'era.consolidation': { d: EMBLEM.consolidation },
  'era.plateau': { d: EMBLEM.plateau },
  // menu
  'menu.build': { d: D.hammer, size: 26 },
  'menu.staff': { d: D.person, size: 26 },
  'menu.marketing': { d: D.megaphone, size: 26 },
  'menu.models': { d: D.brain, size: 26 },
  'menu.automation': { d: D.robot, size: 26 },
  'menu.policies': { d: D.scroll, size: 26 },
  'menu.ops': { d: D.shield, size: 26 },
  'menu.office': { d: D.building, size: 26 },
  'menu.reports': { d: D.barChart, size: 26 },

  // speed controls: flat shapes in currentColor for the buttons
  'speed.pause': { d: `<rect x="5.5" y="4.5" width="4.5" height="15" rx="1.6" fill="currentColor"/><rect x="14" y="4.5" width="4.5" height="15" rx="1.6" fill="currentColor"/>` },
  'speed.play': { d: `<path d="M7 4.8v14.4a1.3 1.3 0 0 0 2 1.1l11-7.2a1.3 1.3 0 0 0 0-2.2L9 3.7a1.3 1.3 0 0 0-2 1.1Z" fill="currentColor"/>` },
  'speed.fast': { d: `<path d="M2.5 5.5v13a1.2 1.2 0 0 0 1.9 1l8.4-6.5a1.2 1.2 0 0 0 0-2L4.4 4.5a1.2 1.2 0 0 0-1.9 1ZM11.5 5.5v13a1.2 1.2 0 0 0 1.9 1l8.4-6.5a1.2 1.2 0 0 0 0-2l-8.4-6.5a1.2 1.2 0 0 0-1.9 1Z" fill="currentColor"/>` },
  'speed.fastest': { d: `<path d="M1 6.5v11a1 1 0 0 0 1.6.8L9 13a1 1 0 0 0 0-1.8L2.6 5.7A1 1 0 0 0 1 6.5ZM8 6.5v11a1 1 0 0 0 1.6.8L16 13a1 1 0 0 0 0-1.8L9.6 5.7A1 1 0 0 0 8 6.5ZM15 6.5v11a1 1 0 0 0 1.6.8L23 13a1 1 0 0 0 0-1.8l-6.4-5.5a1 1 0 0 0-1.6.8Z" fill="currentColor"/>` },

  // arrows and small marks, tinted by CSS
  'arrow.up': { d: path('M12 3.5 20.5 13h-5v7.5h-7V13h-5Z', 'currentColor') },
  'arrow.down': { d: path('M12 20.5 20.5 11h-5V3.5h-7V11h-5Z', 'currentColor') },
  'arrow.flat': { d: circ(12, 12, 4.5, 'currentColor') },
  'arrow.back': { d: path('M3.5 12 12 4v5h8.5v6H12v5Z', 'currentColor') },
  'sound.on': { d: `<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/>` },
  'sound.off': { d: `<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/>` },
  expand: { d: `<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` },
  'caret.down': { d: `<path d="M5 8.5h14l-7 8Z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>` },
  'caret.right': { d: `<path d="M8.5 5v14l8-7Z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>` },
  'sort.up': { d: `<path d="M12 5 20 17H4Z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>` },
  'sort.down': { d: `<path d="M12 19 20 7H4Z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>` },
  close: { d: `<path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" fill="none"/>` },
  check: { d: `<path d="M4.5 12.5l5 5 10-11" stroke="currentColor" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` },
  cross: { d: `<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" fill="none"/>` },
  star: { d: path(star5(12, 12.6, 10, 4.6), 'currentColor') },
  lock: { d: `<path d="M8 11V8a4 4 0 0 1 8 0v3" ${line(2.6)}/>` + rr(4.5, 10.5, 15, 11, 2.5, C.gold) + path('M12 14.5v3') + dot(12, 14.8, 1.6) },
  hourglass: { d: rr(5, 2.5, 14, 3, 1.2, C.wood) + rr(5, 18.5, 14, 3, 1.2, C.wood) + path('M7 5.5h10c0 4-5 5-5 6.5s5 2.5 5 6.5H7c0-4 5-5 5-6.5S7 9.5 7 5.5Z', C.glass)
    + path('M9.3 18.5c.5-2 2.7-2.6 2.7-3.8 0 1.2 2.2 1.8 2.7 3.8Z', C.yellow) + `<path d="M9.5 8h5l-2.5 2.5Z" fill="${C.yellow}"/>` },
  warn: { d: path('M12 3.5 21.5 19.5a1 1 0 0 1-.9 1.5H3.4a1 1 0 0 1-.9-1.5Z', C.yellow) + `<path d="M12 9.5v5" ${line(2.6)}/>` + dot(12, 17.6, 1.5) },
  settings: { d: path(gear(12, 12, 10, 7.6, 8), C.metal) + circ(12, 12, 3.2, PAPER) },
  idea: { d: path('M12 2.5a6.5 6.5 0 0 0-4 11.6c.8.7 1.2 1.6 1.2 2.6h5.6c0-1 .4-1.9 1.2-2.6A6.5 6.5 0 0 0 12 2.5Z', C.yellow) + rr(9, 16.8, 6, 4.5, 1.5, C.metal)
    + `<path d="M9.5 18.8h5" ${line(1.4)}/><path d="M9.5 7.5a3 3 0 0 1 2.5-1.6" stroke="${PAPER}" stroke-width="1.6" stroke-linecap="round" fill="none"/>` },
  decision: { d: D.signpost },
  legend: { d: path(star5(12, 12.5, 9.5, 4.4), C.gold) + path(sparkle(19.5, 4.5, 3), C.yellow) + path(sparkle(4.5, 19.5, 2.4), C.yellow) },
  path: { d: D.compass },
  slot: { d: `<rect x="3.5" y="3.5" width="17" height="17" rx="3.5" fill="${C.cream}" stroke="${INK}" stroke-width="2" stroke-dasharray="3.4 2.6"/>` + `<path d="M12 8.5v7M8.5 12h7" ${line(2.2)}/>` },

  // toasts
  'toast.info': { d: D.bubble },
  'toast.good': { d: path(sparkle(11, 12.5, 8.5), C.yellow) + path(sparkle(19, 5, 3), C.gold) },
  'toast.warn': { d: path('M12 3.5 21.5 19.5a1 1 0 0 1-.9 1.5H3.4a1 1 0 0 1-.9-1.5Z', C.yellow) + `<path d="M12 9.5v5" ${line(2.6)}/>` + dot(12, 17.6, 1.5) },
  'toast.bad': { d: D.flame },

  // tray
  'tray.outage': { d: D.siren },
  'tray.project': { d: D.hammer },
  'tray.trend': { d: circ(12, 12, 10.5, C.cream) + `<path d="M12 20V12" ${line(2.4)}/>` + circ(12, 10.5, 2.4, C.red) + `<path d="M8.5 7a5.5 5.5 0 0 0 0 7M15.5 7a5.5 5.5 0 0 1 0 7M5.8 4.8a9 9 0 0 0 0 11.4M18.2 4.8a9 9 0 0 1 0 11.4" ${line(1.7)}/>` },
  'tray.effects': { d: circ(12, 12, 9.5, C.purple) + `<path d="M12 12a1.6 1.6 0 0 1 3.2 0 3.2 3.2 0 0 1-6.4 0 4.8 4.8 0 0 1 9.6 0 6.4 6.4 0 0 1-12.8 0" stroke="${PAPER}" stroke-width="2" stroke-linecap="round" fill="none"/>` },

  // moods
  'mood.ok': { d: face(eyes + cheeks + `<path d="M8.5 14.5q3.5 3.5 7 0" ${line(1.8)}/>`) },
  'mood.coasting': { d: face(`<path d="M7.5 11h3M13.5 11h3" ${line(1.8)}/>` + `<path d="M9 16h6" ${line(1.8)}/>`) },
  'mood.burnout': { d: face(`<path d="M7.5 9.5l3 3M10.5 9.5l-3 3M13.5 9.5l3 3M16.5 9.5l-3 3" ${line(1.6)}/>` + `<path d="M8.5 17q1-1.5 1.8 0t1.7 0 1.7 0 1.8 0" ${line(1.5)}/>`, '#d9c6b0') },
  'mood.away': { d: path('M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2', 'none') + rr(3, 7, 18, 13.5, 2.5, C.terracotta) + `<path d="M3 12h18" ${line(1.6)}/>` + circ(16, 16, 2.2, C.yellow) + `<path d="M7 20.5v1.5M17 20.5v1.5" ${line(2)}/>` },

  // project sizes
  'size.small': { d: path('M6.5 13h11l-1.5 8h-8Z', C.pink) + path('M5 13a7 7 0 0 1 14 0Z', C.cream) + dot(12, 5.5, 1.8, C.red) + `<path d="M9 16.5v2.5M12 16.5v2.5M15 16.5v2.5" ${line(1.2)}/>` },
  'size.medium': { d: rr(3.5, 11, 17, 10, 2, C.pink) + rr(3.5, 11, 17, 3.5, 1.5, C.cream) + `<path d="M8 11V7M12 11V6M16 11V7" ${line(1.6)}/>` + dot(8, 5.5, 1.1, C.yellow) + dot(12, 4.5, 1.1, C.yellow) + dot(16, 5.5, 1.1, C.yellow) },
  'size.large': { d: path('M3.5 21.5V9h3v2.5h2V9h3v2.5h1V9h3v2.5h2V9h3v12.5Z', C.cream) + rr(10, 15, 4, 6.5, 2, C.woodDark) + path('M12 9V3.5l4 1.5-4 1.5', C.red) },

  // concepts
  new: { d: path(sparkle(10, 13, 8), C.yellow) + path(sparkle(18.5, 5, 3.2), C.gold) },
  project: { d: D.hammer },
  dice: { d: rr(3.5, 3.5, 17, 17, 4, PAPER) + [[8, 8], [16, 8], [12, 12], [8, 16], [16, 16]].map(([x, y]) => dot(x, y, 1.6)).join('') },
  launch: { d: D.rocket },
  agentic: { d: D.robot },
  compliance: { d: D.scroll },
  update: { d: rr(3.5, 3.5, 17, 17, 4, C.blue) + `<path d="M12 17V7.5M7.5 11.5 12 7l4.5 4.5" stroke="${PAPER}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` },
  migrate: { d: path('M4 9.5h12.5V6l4 4.5-4 4.5v-3.5H4Z', C.blue) + path('M20 17.5H9.5V21l-4-4.5 4-4.5v3.5H20Z', C.green) },
  refactor: { d: `<path d="M18.5 3 11 12.5" ${line(2.6)}/>` + path('M11.5 11.5 14 14l-2.5 7.5-8-5L7 10.5Z', C.yellow) + `<path d="M6 15.5l4.5 2.5M8 13l4 2.5" ${line(1.2)}/>` },
  craft: { d: D.pencil },
  mentor: { d: D.gradcap },
  hardProblem: { d: D.puzzle },
  oversight: { d: D.eyes },
  sabbatical: { d: D.palm },
  training: { d: D.book },
  letgo: { d: D.door },
  team: { d: circ(8, 8, 3.3, C.skin) + path('M2.5 19c0-3.4 2.5-5.8 5.5-5.8s5.5 2.4 5.5 5.8Z', C.blue) + circ(16, 8.5, 3.3, C.skin) + path('M10.5 19.5c0-3.4 2.5-5.8 5.5-5.8s5.5 2.4 5.5 5.8Z', C.pink) },
  seat: { d: rr(6, 3, 12, 10, 3, C.teal) + rr(4.5, 12, 15, 4, 2, C.teal) + `<path d="M7 16v5M17 16v5M12 16v3" ${line(2)}/>` },
  refresh: { d: `<path d="M19 12a7 7 0 0 1-12 5M5 12a7 7 0 0 1 12-5" ${line(2.6)}/>` + path('M17 3v4.5h-4.5', 'none') + path('M7 21v-4.5h4.5', 'none') },
  hire: { d: rr(2.5, 5.5, 19, 13, 2, PAPER) + path('M3.5 7 12 13l8.5-6', 'none') + path(star5(18.5, 17.5, 3.6, 1.7), C.yellow) },
  office: { d: D.building },
  money: { d: D.banknote },
  debt: { d: circ(12, 12, 8.5, C.orange) + `<path d="M6 9q6 2 12-1M5.5 14q6.5-4 13 1M8 18.5q2-7 7-12M9 5q4 7 9 11" stroke="${INK}" stroke-width="1.3" stroke-linecap="round" fill="none"/>` + `<path d="M19 18q2.5 1 2.5 3" ${line(1.6)}/>` },
  pair: { d: D.robot.replace(/<path d="M12 2.5v3"[^>]*\/>/, '') },
  policy: { d: D.scroll },
  product: { d: D.box },
  selfhost: { d: D.server },
  hype: { d: D.flame },
  brand: { d: D.heart },
  wrapper: { d: path('M4 16.5 15.5 5a4 4 0 0 1 5.5 5.5L9.5 22a4 4 0 0 1-5.5-5.5Z', '#e6c18f') + `<path d="M8.5 12l3.5 3.5M11.5 9l3.5 3.5M14.5 6l3.5 3.5" ${line(1.4)}/>` + path('M15.5 5a4 4 0 0 1 5.5 5.5l-2-2.2 1-1.5-2-.5-.5-2Z', C.leaf) },
  marketer: { d: D.megaphone },
  humanCopy: { d: D.pencil },
  clock: { d: circ(12, 13.5, 8, PAPER) + rr(10, 2.5, 4, 2.5, 1, C.metal) + `<path d="M12 13.5V9M12 13.5l3 2" ${line(2)}/>` },
  award: { d: D.trophy },
  security: { d: D.shield },
  audit: { d: D.magnifier },
  consultants: { d: path('M3 16.5a9 9 0 0 1 18 0Z', C.yellow) + rr(2, 16, 20, 3.5, 1.5, C.yellow) + `<path d="M12 7.5v4" ${line(1.8)}/>` + path('M9 8q3-1.5 6 0', 'none') },
  incident: { d: D.siren },
  caught: { d: D.shield.replace(C.red, C.green).replace('#f06a6e', '#6ed8a8') + `<path d="M8.5 12l2.5 2.5 4.5-5" stroke="${PAPER}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` },
  rent: { d: path('M6 2.5h12v19l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5Z', PAPER) + `<path d="M9 7h6M9 10.5h6M9 14h3.5" ${line(1.6)}/>` },
  chart: { d: rr(3, 3, 18, 18, 3, PAPER) + `<path d="M6.5 16.5l4-4.5 3 2.5 4.5-6" stroke="${C.green}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` },
  continue: { d: rr(3.5, 3.5, 17, 17, 2.5, C.blue) + rr(7, 3.5, 10, 6.5, 1, C.cream) + rr(6.5, 13, 11, 7.5, 1, PAPER) + rr(13, 5, 2.5, 3.5, 0.5, C.metalDark) },
  gameover: { d: path('M5 21.5V10a7 7 0 0 1 14 0v11.5Z', C.metal) + rr(3, 20, 18, 2.5, 1, C.leaf) + `<path d="M8.5 10h7M8.5 13.5h7M10 17h4" ${line(1.8)}/>` },
  research: { d: D.testtube },

  // automation functions
  'fn.engineering': { d: rr(1.5, 6, 21, 13, 3, C.cream) + [4, 8.5, 13, 17.5].map((x) => `<rect x="${x}" y="8.5" width="3" height="3" rx=".7" fill="${C.metalDark}"/>`).join('')
    + `<rect x="5.5" y="13.5" width="13" height="3" rx=".8" fill="${C.metalDark}"/>` },
  'fn.support': { d: D.headset },
  'fn.sales': { d: D.briefcase },
  'fn.marketing': { d: D.pencil },
  'fn.qa': { d: path('M9 2.5h6M10 2.5v6L4.5 18.5A2 2 0 0 0 6.3 21.5h11.4a2 2 0 0 0 1.8-3L14 8.5v-6', PAPER)
    + path('M7 14h10l2.6 4.6a1.3 1.3 0 0 1-1.1 1.9h-13a1.3 1.3 0 0 1-1.1-1.9Z', C.green) + dot(10, 17, 1.1, PAPER) + dot(14, 16, 0.8, PAPER) },
  'fn.ops': { d: D.monitor },

  // marketing channels
  'channel.launch': { d: D.rocket },
  'channel.content': { d: rr(4, 2.5, 16, 19, 2, PAPER) + `<rect x="6.5" y="5" width="11" height="4" rx="1" fill="${C.blue}"/>` + `<path d="M7 12h10M7 15h10M7 18h6" ${line(1.6)}/>` },
  // Launch-day upvote parade: a pink rosette ribbon with an upvote chevron (an original mark, no letter).
  'channel.producthunt': { d: path('M8 15.5 6 22l3-1.6L11 22l.6-5.5M16 15.5l2 6.5-3-1.6L13 22l-.6-5.5', C.purple) + path('M12 2.5l2.2 1.6 2.7-.2.9 2.6 2.3 1.4-.7 2.6 1 2.5-2.2 1.6-.6 2.7-2.7.3L12 19.2l-2.1-1.6-2.7-.3-.6-2.7-2.2-1.6 1-2.5-.7-2.6 2.3-1.4.9-2.6 2.7.2Z', C.pink) + `<path d="M8.6 12.6 12 9.2l3.4 3.4" stroke="${PAPER}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` },
  'channel.community': { d: path('M2.5 5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-3.5 3v-3h-1a2 2 0 0 1-2-2Z', C.purple) + path('M11 13v1.5a2 2 0 0 0 2 2h4l3.5 3v-3h.5a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-3.5', C.blue) },
  'channel.ads': { d: D.megaphone },
  'channel.influencer': { d: rr(6.5, 2.5, 11, 19, 2.5, C.metalDark) + rr(8, 4.5, 8, 13, 1, C.pink) + path(star5(12, 11, 3.6, 1.6), C.yellow) + dot(12, 19.5, 0.9, PAPER) },
  'channel.conference': { d: path('M2.5 10 12 3.5 21.5 10Z', C.red) + rr(4, 10, 16, 11, 1, C.cream) + rr(9.5, 14, 5, 7, 1, C.woodDark) + `<path d="M4 10h16" ${line()}/>` + path('M12 3.5V1.5h3', 'none') },
  'channel.enterprise': { d: D.briefcase },

  // training programs
  'train.workshop': { d: `<path d="M5 19l8.5-8.5" ${line(3.2)}/>` + path('M13 7.5a4 4 0 0 1 5.5-4.2l-2.8 2.8.6 2.1 2.1.6 2.8-2.8A4 4 0 0 1 16.5 11Z', C.metal) },
  'train.conference': { d: rr(8.5, 2.5, 7, 11, 3.5, C.metalDark) + `<path d="M5.5 10.5a6.5 6.5 0 0 0 13 0M12 17v4.5M8.5 21.5h7" ${line(2)}/>` + `<path d="M10 5.5h4M10 8h4" stroke="${C.metal}" stroke-width="1.2" stroke-linecap="round"/>` },
  'train.course': { d: D.gradcap },

  // Yak: the team chat's logo, a shaggy yak head.
  'brand.yak': { d: path('M4.5 7.5C2.5 7 2 4.5 3 3c.8 2 2.2 2.6 4 2.7M19.5 7.5c2-.5 2.5-3 1.5-4.5-.8 2-2.2 2.6-4 2.7', C.cream)
    + path('M6 8.5c0-2.2 2.7-3.8 6-3.8s6 1.6 6 3.8c1.2.6 1.8 1.7 1.3 2.8-.6 1.2-1.6 1.2-1.6 1.2l-.7 4.3c-.5 2.8-2.6 4.5-5 4.5s-4.5-1.7-5-4.5l-.7-4.3s-1 0-1.6-1.2c-.5-1.1.1-2.2 1.3-2.8Z', C.woodDark)
    + path('M9 15.5c0-1.2 1.3-2 3-2s3 .8 3 2-1.3 2.5-3 2.5-3-1.3-3-2.5Z', C.wood)
    + dot(9.4, 11.2, 1.1) + dot(14.6, 11.2, 1.1) + dot(11, 15.6, 0.6) + dot(13, 15.6, 0.6)
    + `<path d="M8 7.5q2 1.6 4 .2 2 1.4 4-.2" ${line(1.3)}/>` },
  // Yak bot avatars
  'bot.pager': { d: D.siren },
  'bot.vendor': { d: D.brain },
  'bot.launch': { d: circ(12, 12, 10.5, C.blue) + `<g transform="translate(3.6 3.4) scale(.7)">${D.rocket}</g>` },
  'bot.hr': { d: path('M3 21 8 8l8 8Z', C.yellow) + `<path d="M5 15.5l3.5 3.5M6.5 11.5l6 6" stroke="${C.red}" stroke-width="1.6" fill="none"/>` + dot(15, 5, 1.4, C.pink) + dot(19.5, 9.5, 1.4, C.blue) + dot(18, 3.5, 1, C.green) + `<path d="M12 7q1-3 4-4M16.5 12q3-1 4.5 1" ${line(1.6)}/>` },
  'bot.awards': { d: D.trophy },
  'bot.office': { d: D.building },
  // @hackerspewsbot: a teal speech bubble spewing hot takes (original mark: no letterform, no orange).
  'bot.hn': { d: path('M4.5 4h11a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H10l-4.5 4v-4h-1a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z', C.teal) + `<path d="M6.5 8.5h7M6.5 11.5h4.5" stroke="${PAPER}" stroke-width="1.9" stroke-linecap="round" fill="none"/>` + dot(20.5, 5, 1.3, C.red) + dot(21.5, 9, 1, C.yellow) + dot(20, 12.5, 1.2, C.red) },
  'bot.generic': { d: D.robot },
  'bot.news': { size: 13, d: "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2.5\" fill=\"#fbf5ea\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"6\" y=\"7\" width=\"6\" height=\"5\" rx=\"1\" fill=\"#4f8cff\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M14.5 8h3.5M14.5 11h3.5M6 15h12M6 17.5h8\" stroke=\"#2a2630\" stroke-width=\"1.6\" stroke-linecap=\"round\" fill=\"none\"/>" },
  'bot.build': { size: 13, d: "<path d=\"M14.5 3.5a4.5 4.5 0 0 0-5.3 5.7l-5.4 5.4a2 2 0 0 0 2.8 2.8l5.4-5.4a4.5 4.5 0 0 0 5.7-5.3l-2.6 2.6-2.3-.6-.6-2.3z\" fill=\"#b9bcc4\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"18\" cy=\"18\" r=\"3.5\" fill=\"#34c38f\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M16.6 18l1 1 1.9-2\" stroke=\"#fbf5ea\" stroke-width=\"1.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\"/>" },

  // Yak reactions
  'react.party': { d: path('M3 21 8 8l8 8Z', C.yellow) + `<path d="M5 15.5l3.5 3.5M6.5 11.5l6 6" stroke="${C.red}" stroke-width="1.6" fill="none"/>` + dot(15, 5, 1.4, C.pink) + dot(19.5, 9.5, 1.4, C.blue) + dot(18, 3.5, 1, C.green) },
  'react.rocket': { d: D.rocket },
  'react.clap': { d: path('M7 12.5 5 8.5a1.3 1.3 0 0 1 2.3-1.2L10 12l-2.5-6a1.3 1.3 0 0 1 2.4-1l3 6.5-.5-4a1.3 1.3 0 0 1 2.6-.2l1 7a6 6 0 0 1-3.5 6.3 6 6 0 0 1-7.4-2.7Z', C.skin) + `<path d="M17.5 3.5l-1 2M20.5 6l-2 1M20.5 10h-2" ${line(1.5)}/>` },
  'react.fire': { d: D.flame },
  'react.100': { d: `<text x="12" y="15.5" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="10.5" fill="${C.red}" stroke="${INK}" stroke-width=".6">100</text>` + `<path d="M3.5 18.5h17M5 20.5h14" stroke="${C.red}" stroke-width="1.6" stroke-linecap="round"/>` },
  'react.skull': { d: path('M12 2.5a8 8 0 0 0-8 8c0 2.8 1.3 4.4 3 5.5V20a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 17 20v-4c1.7-1.1 3-2.7 3-5.5a8 8 0 0 0-8-8Z', PAPER) + circ(8.8, 11, 2, INK) + circ(15.2, 11, 2, INK) + `<path d="M10 18.5v3M14 18.5v3M11 15l1-1.5 1 1.5" ${line(1.4)}/>` },
  'react.eyes': { d: D.eyes },
  'react.grimace': { d: face(eyes + rr(7.5, 14.5, 9, 3.5, 1.2, PAPER) + `<path d="M10.5 14.5v3.5M13.5 14.5v3.5" ${line(1)}/>`) },
  'react.melt': { d: path('M3 12.5a9 9 0 0 1 18 0c0 3-1.5 3.5-1.5 5.5s2.5 1.5 2.5 3.5H2c0-2 2.5-1.5 2.5-3.5S3 15.5 3 12.5Z', C.yellow) + eyes + `<path d="M9 15q3 2 6 0" ${line(1.6)}/>` },
  'react.salute': { d: face(eyes + `<path d="M9 15.5q3 2 6 0" ${line(1.6)}/>`, C.yellow) + path('M14 7.5l5-4 2 2.5-4.5 4Z', C.skin) },
  'react.blueheart': { d: D.heart.replace(C.purple, C.blue) },
  'react.cry': { d: face(`<path d="M8 11.5q1-1 2 0M14 11.5q1-1 2 0" ${line(1.5)}/>` + `<path d="M9 17q3-2.5 6 0" ${line(1.6)}/>` + path('M8.5 13c-.8 1.5-1.4 2.5-1.4 3.4a1.4 1.4 0 0 0 2.8 0c0-.9-.6-1.9-1.4-3.4Z', C.screenBlue), C.yellow) },
  'react.laugh': { d: face(`<path d="M7.5 11q1.5-1.5 3 0M13.5 11q1.5-1.5 3 0" ${line(1.6)}/>` + path('M7.5 14h9a4.5 4.5 0 0 1-9 0Z', PAPER), C.yellow) },
  'react.dog': { d: path('M5 9.5 3 4.5l4.5 2M19 9.5 21 4.5l-4.5 2', C.woodDark) + circ(12, 13, 8, C.wood) + eyes.replace(/cy="11"/g, 'cy="12"') + path('M10 15.5h4l-2 2Z', INK) + `<path d="M12 17.5v1.2" ${line(1.4)}/>` },
  'react.coffee': { d: path('M4 9h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z', C.mug) + `<path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17" ${line()}/>` + `<rect x="5.5" y="10.5" width="10" height="2" rx="1" fill="${C.coffee}"/>` + `<path d="M8.5 6.5q1-1.5 0-3M12.5 6.5q1-1.5 0-3" ${line(1.5)}/>` },
  'react.sprout': { d: path('M7 16h10l-1.5 5.5h-7Z', C.pot) + `<path d="M12 16v-6" ${line(2)}/>` + path('M12 10C12 6 9 4 4.5 4.5 5 8.5 8 10.5 12 10Z', C.leaf) + path('M12 12c0-3 2.5-4.5 6-4 0 3-2.5 4.5-6 4Z', C.leafLight) },
  'react.pizza': { d: path('M3.5 5.5Q12 1.5 20.5 5.5L12 21.5Z', C.yellow) + path('M3.5 5.5Q12 1.5 20.5 5.5l-1.2 2.3Q12 4.3 4.7 7.8Z', C.wood) + circ(10, 10, 1.5, C.red) + circ(14, 11, 1.4, C.red) + circ(12, 15.5, 1.3, C.red) },
  'react.thumbsup': { d: path('M7.5 10.5 11 3.5a2 2 0 0 1 2.5 2L13 9.5h5.5a2 2 0 0 1 2 2.3l-1.3 7.2a2 2 0 0 1-2 1.5H7.5Z', C.skin) + rr(3, 10, 4.5, 11, 1.5, C.blue) },
  'react.upside': { d: `<g transform="rotate(180 12 12.5)">${face(eyes + `<path d="M8.5 14.5q3.5 3.5 7 0" ${line(1.8)}/>`, C.yellow)}</g>` },
  // Glyphs for build mode, stat names, remote work, and call and energy markers.
  'item.couch': { size: 30, d: "<rect x=\"2.5\" y=\"9\" width=\"19\" height=\"8\" rx=\"2.5\" fill=\"#9b6bff\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"5\" y=\"6\" width=\"14\" height=\"5\" rx=\"2\" fill=\"#b89bff\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"2.5\" y=\"10.5\" width=\"3.5\" height=\"6.5\" rx=\"1.5\" fill=\"#9b6bff\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"18\" y=\"10.5\" width=\"3.5\" height=\"6.5\" rx=\"1.5\" fill=\"#9b6bff\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M5 17v2.5M19 17v2.5\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\" fill=\"none\"/>" },
  'item.foosball': { size: 30, d: "<rect x=\"3\" y=\"5\" width=\"18\" height=\"12\" rx=\"2\" fill=\"#34c38f\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 5v12\" stroke=\"#fbf5ea\" stroke-width=\"1.5\" fill=\"none\"/><path d=\"M1.5 9h21M1.5 13h21\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\" fill=\"none\"/><rect x=\"7\" y=\"7.5\" width=\"2\" height=\"3\" rx=\"0.8\" fill=\"#e5484d\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"15\" y=\"11.5\" width=\"2\" height=\"3\" rx=\"0.8\" fill=\"#4f8cff\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M6 17v3M18 17v3\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\" fill=\"none\"/>" },
  'item.ping_pong_table': { size: 30, d: "<path d=\"M2.5 11h19l-2 5h-15z\" fill=\"#4f8cff\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 11v5\" stroke=\"#fbf5ea\" stroke-width=\"1.5\" fill=\"none\"/><path d=\"M5 16v4M19 16v4\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\" fill=\"none\"/><circle cx=\"17\" cy=\"5.5\" r=\"3\" fill=\"#e5484d\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M15 7.5 12.5 10\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\" fill=\"none\"/><circle cx=\"8\" cy=\"7\" r=\"1.3\" fill=\"#fbf5ea\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/>" },
  'battery.low': { size: 14, d: "<rect x=\"2.5\" y=\"7\" width=\"17\" height=\"10\" rx=\"2.2\" fill=\"#fbf5ea\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M21.5 10.5v3\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\" fill=\"none\"/><rect x=\"5\" y=\"9.5\" width=\"3.5\" height=\"5\" rx=\"0.8\" fill=\"#e5484d\"/>" },
  'home': { size: 14, d: "<path d=\"M3.5 11.5L12 4l8.5 7.5\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\" fill=\"none\"/><path d=\"M6 10v10h12V10\" fill=\"#ffb020\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"10\" y=\"14\" width=\"4\" height=\"6\" fill=\"#fbf5ea\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/>" },
  'item.bookshelf': { size: 30, d: "<rect x=\"3.5\" y=\"2.5\" width=\"17\" height=\"19\" rx=\"1.5\" fill=\"#e0a86a\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M3.5 12h17\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\" fill=\"none\"/><rect x=\"6\" y=\"5\" width=\"2.5\" height=\"7\" fill=\"#4f8cff\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"9.5\" y=\"6\" width=\"2.5\" height=\"6\" fill=\"#ff7eb6\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"6\" y=\"14.5\" width=\"2.5\" height=\"7\" fill=\"#34c38f\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"13\" y=\"15.5\" width=\"4.5\" height=\"6\" fill=\"#ffb020\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/>" },
  'item.coffee_corner': { size: 30, d: "<path d=\"M5 9h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z\" fill=\"#fbf5ea\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M16 11h1.5a2.5 2.5 0 0 1 0 5H16\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\" fill=\"none\"/><path d=\"M8 3.5c1 1-1 2 0 3.5M12 3.5c1 1-1 2 0 3.5\" stroke=\"#8f8795\" stroke-width=\"2\" stroke-linecap=\"round\" fill=\"none\"/><path d=\"M3 21h16\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\" fill=\"none\"/>" },
  'item.desk': { size: 30, d: "<rect x=\"7\" y=\"3\" width=\"10\" height=\"7\" rx=\"1.5\" fill=\"#4f8cff\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 10v2\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\" fill=\"none\"/><rect x=\"2.5\" y=\"12\" width=\"19\" height=\"3.5\" rx=\"1.5\" fill=\"#e0a86a\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M5 15.5v5M19 15.5v5\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\" fill=\"none\"/>" },
  'item.meeting_table': { size: 30, d: "<ellipse cx=\"12\" cy=\"12\" rx=\"9.5\" ry=\"5.5\" fill=\"#e0a86a\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"4\" cy=\"5\" r=\"2\" fill=\"#34c38f\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"20\" cy=\"5\" r=\"2\" fill=\"#ff7eb6\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"4\" cy=\"19.5\" r=\"2\" fill=\"#ffb020\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"20\" cy=\"19.5\" r=\"2\" fill=\"#9b6bff\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/>" },
  'item.plant': { size: 30, d: "<path d=\"M12 13c-5 0-7-4-7-8 4 0 7 2 7 8zM12 13c5 0 7-4 7-8-4 0-7 2-7 8z\" fill=\"#34c38f\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M7 13h10l-1.5 8h-7z\" fill=\"#e08a3c\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/>" },
  'item.whiteboard': { size: 30, d: "<rect x=\"3\" y=\"3\" width=\"18\" height=\"12\" rx=\"1.5\" fill=\"#ffffff\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M6.5 7.5h6M6.5 11h9\" stroke=\"#4f8cff\" stroke-width=\"2\" stroke-linecap=\"round\" fill=\"none\"/><path d=\"M8 15l-2 6M16 15l2 6\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\" fill=\"none\"/>" },
  'mic.off': { size: 14, d: "<rect x=\"8.5\" y=\"2.5\" width=\"7\" height=\"12\" rx=\"3.5\" fill=\"#fbf5ea\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M5 11a7 7 0 0 0 14 0M12 18v3.5\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\" fill=\"none\"/><path d=\"M3.5 3.5l17 17\" stroke=\"#e5484d\" stroke-width=\"2.6\" stroke-linecap=\"round\"/>" },
  'stat.features': { size: 16, d: "<rect x=\"3\" y=\"13\" width=\"8\" height=\"8\" rx=\"1.5\" fill=\"#4f8cff\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"13\" y=\"13\" width=\"8\" height=\"8\" rx=\"1.5\" fill=\"#8ec5ff\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"8\" y=\"3\" width=\"8\" height=\"8\" rx=\"1.5\" fill=\"#4f8cff\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/>" },
  'stat.novelty': { size: 16, d: "<path d=\"M12 2.5a6.5 6.5 0 0 0-4 11.6V17h8v-2.9A6.5 6.5 0 0 0 12 2.5z\" fill=\"#ffb020\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M9 20.5h6\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\" fill=\"none\"/>" },
  'stat.polish': { size: 16, d: "<path d=\"M14.5 3.5l6 6-7.5 7.5-6-6z\" fill=\"#ff7eb6\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M7 11l6 6-2.5 2.5c-1.5 1.5-4.5 2-7 1.5.5-2.5 0-5.5 1-7z\" fill=\"#ffd1e6\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/>" },
  'stat.reliability': { size: 16, d: "<path d=\"M12 2.5l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6z\" fill=\"#34c38f\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M8.5 12l2.5 2.5 4.5-5\" stroke=\"#fff\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\"/>" },
  'react.no_at_channel': { size: 12, d: "<circle cx=\"12\" cy=\"12\" r=\"9.5\" fill=\"#fbf5ea\" stroke=\"#2a2630\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M14.6 12.2a2.6 2.6 0 1 1-2.6-2.6 2.6 2.6 0 0 1 2.6 2.6v1.1a1.6 1.6 0 0 0 3.2 0V12a5.8 5.8 0 1 0-2.3 4.6\" stroke=\"#2a2630\" stroke-width=\"1.7\" stroke-linecap=\"round\" fill=\"none\"/><path d=\"M5.3 5.3l13.4 13.4\" stroke=\"#e5484d\" stroke-width=\"2.6\" stroke-linecap=\"round\"/>" },
};

// Chat reaction emoji from the sim, mapped to glyph names.
export const REACTION_GLYPH = {
  '🎉': 'react.party', '🚀': 'react.rocket', '👏': 'react.clap', '🔥': 'react.fire', '💯': 'react.100', '💀': 'react.skull',
  '👀': 'react.eyes', '😬': 'react.grimace', '🫠': 'react.melt', '🫡': 'react.salute', '💙': 'react.blueheart', '😢': 'react.cry',
  '😂': 'react.laugh', '🐶': 'react.dog', '☕': 'react.coffee', '🌱': 'react.sprout', '🍕': 'react.pizza', '👍': 'react.thumbsup', '🙃': 'react.upside',
  no_at_channel: 'react.no_at_channel',
};

export function glyphSvg(name) {
  const g = GLYPHS[name];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><g id="g">${g.d}</g></svg>\n`;
}
