// Builds the README logo from a game character: renders the character (bust.js) through the game's
// own renderer, writes docs/readme/logo.svg (loop ring, check badge, character, wordmark, Approve
// button; Fredoka embedded so the file stands alone), and exports the PNGs from that SVG.
//
//   node blender/logo/build.mjs [--out docs/readme]
//
// Writes logo.svg, logo.png and logo-dark-theme.png (the wide logo; the dark variant lightens the
// grey text), logo-square.png (the mark alone) and social-preview.png (1280x640, on cream).
import { startHarness } from '../checks/harness.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const OUT = resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : 'docs/readme');
mkdirSync(OUT, { recursive: true });

// The engineer in the hoodie, mid-wave with the hand clear of the head.
const CHARACTER = {
  person: { id: 'logo-a', role: 'engineer', appearance: { skin: 2, hair: 1, hairColor: '#4a3222', shirt: '#e8e2d6', pants: '#2e3440', build: 1, accessory: 'none' } },
  pose: { anim: 'wave', animT: 1.6, yaw: -0.3 },
};

const INK = '#2a2630', GREY = '#6b5f52', GREY_DARK_THEME = '#d8c9b4', BLUE = '#4f8cff', GREEN = '#34c38f', CREAM = '#fbf5ea';
const font = readFileSync(resolve(HERE, 'fredoka-latin.woff2')).toString('base64');

const H = await startHarness();
const { page, errors } = await H.openScene('quality=high&mock=garage', { width: 640, height: 400 });
const art = await page.evaluate(async ({ person, pose }) => {
  const m = await import('/blender/logo/bust.js');
  return m.renderBust(person, pose);
}, CHARACTER);
if (errors.length) { console.error(errors); process.exitCode = 1; }

// The mark: ring centre (CX, CY), radius R. The character stands in the ring, its cut-off bottom
// rounded by the ring's inside; higher up it may overlap the ring (the waving hand does).
const CX = 150, CY = 180, R = 112;
const pt = (deg, r = R) => [CX + r * Math.cos((deg * Math.PI) / 180), CY + r * Math.sin((deg * Math.PI) / 180)].map((v) => v.toFixed(1));
const [ax, ay] = pt(-78), [bx, by] = pt(38);
const artH = 196, artW = (artH * art.width) / art.height;
const mark = `<g id="mark">
    <clipPath id="inring"><circle cx="${CX}" cy="${CY}" r="${R - 12}"/><rect x="0" y="0" width="${CX * 2 + R}" height="${CY + 45}"/></clipPath>
    <path d="M ${ax} ${ay} A ${R} ${R} 0 1 0 ${bx} ${by}" fill="none" stroke="${BLUE}" stroke-width="26" stroke-linecap="round"/>
    <image href="${art.url}" x="${(CX - artW * 0.42).toFixed(1)}" y="${CY - 94}" width="${artW.toFixed(1)}" height="${artH}" clip-path="url(#inring)"/>
    <g transform="translate(212 74) rotate(-6)">
      <rect x="-34" y="-34" width="68" height="68" rx="14" fill="${GREEN}" stroke="${INK}" stroke-width="7"/>
      <path d="M -17 1 L -5 13 L 18 -12" fill="none" stroke="#ffffff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  </g>`;
const words = (grey) => `<g id="words" font-family="Fredoka, sans-serif" font-weight="700">
    <text x="360" y="88" font-size="74" fill="${grey}" letter-spacing="-0.5">Human in the</text>
    <text x="352" y="266" font-size="200" fill="${BLUE}" letter-spacing="-2">Loop</text>
    <g transform="translate(362 284)">
      <rect x="0" y="6" width="172" height="62" rx="13" fill="${INK}"/>
      <rect x="3" y="0" width="166" height="60" rx="12" fill="${GREEN}" stroke="${INK}" stroke-width="6"/>
      <text x="86" y="41" font-size="30" fill="${INK}" text-anchor="middle">Approve</text>
    </g>
    <text x="552" y="327" font-size="24" font-weight="500" fill="${grey}">an AI-era company sim</text>
  </g>`;
const style = `<style>@font-face { font-family: 'Fredoka'; font-weight: 300 700; src: url(data:font/woff2;base64,${font}) format('woff2'); }</style>`;
const svg = (grey) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 858 377" width="858" height="377">
  <title>Human in the Loop: an AI-era company sim</title>
  ${style}
  ${mark}
  ${words(grey)}
</svg>
`;
writeFileSync(resolve(OUT, 'logo.svg'), svg(GREY));

// Exports: each is logo.svg (or its parts) drawn into a page of the export's size.
const light = svg(GREY), dark = svg(GREY_DARK_THEME);
const inner = (s) => s.slice(s.indexOf('>', s.indexOf('<svg')) + 1, s.lastIndexOf('</svg>'));
const EXPORTS = [
  ['logo.png', 858, 377, 2, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 858 377" width="858" height="377">${inner(light)}</svg>`, null],
  ['logo-dark-theme.png', 858, 377, 2, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 858 377" width="858" height="377">${inner(dark)}</svg>`, null],
  // The mark alone, centred in a square.
  ['logo-square.png', 512, 512, 1, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${CX - 175} ${CY - 175} 350 350" width="512" height="512">${style}${mark}</svg>`, null],
  // The wide logo centred on cream at GitHub's social preview size.
  ['social-preview.png', 1280, 640, 1, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-240 -130 1280 640" width="1280" height="640"><rect x="-240" y="-130" width="1280" height="640" fill="${CREAM}"/>${inner(light)}</svg>`, null],
];
for (const [name, w, h, scale, body] of EXPORTS) {
  const p = await H.browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  await p.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${body}</body></html>`);
  await p.evaluate(async () => { await document.fonts.load('700 20px Fredoka'); await document.fonts.ready; });
  await p.screenshot({ path: resolve(OUT, name), omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
  await p.close();
}
await H.close();
console.log('logo written to', OUT);
