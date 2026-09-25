// Renders the trailer's still graphics in headless Chromium with the game's own font and palette:
// the title and end cards, the vertical cut's frame, and one caption strip per voiceover line.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PALETTE = { ink: '#2a2630', inkSoft: '#5b5361', cream: '#fbf5ea', cream3: '#e9dbc2', blue: '#4f8cff', yellow: '#ffb020' };
const FONT_LINK = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&display=block" />';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function page(body, { transparent = false } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8">${FONT_LINK}<style>
    html, body { margin: 0; width: 100%; height: 100%; }
    body { background: ${transparent ? 'transparent' : PALETTE.cream}; color: ${PALETTE.ink}; font-family: 'Fredoka', sans-serif; overflow: hidden; }
    .wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .line { font-weight: 600; color: ${PALETTE.inkSoft}; letter-spacing: 0.01em; }
    .pill { font-weight: 700; color: ${PALETTE.ink}; background: #fff; border: 0.12em solid ${PALETTE.ink}; border-radius: 0.6em; padding: 0.18em 0.7em; box-shadow: 0 0.16em 0 ${PALETTE.ink}; }
    .cap { font-weight: 600; color: ${PALETTE.ink}; background: ${PALETTE.cream}; border: 0.1em solid ${PALETTE.ink}; border-radius: 0.7em; padding: 0.3em 0.9em; box-shadow: 0 0.14em 0 ${PALETTE.ink}; text-align: center; line-height: 1.25; }
  </style></head><body>${body}</body></html>`;
}

// A card: the logo and its lines. The last line of the end card (the play URL) sits in a pill.
function cardHtml(card, w, h, logo) {
  const scale = Math.min(w / 1920, h / 1080) * (w < h ? 1.55 : 1);
  const lines = card.lines.map((t, i) => {
    const pill = card.lines.length > 1 && i === card.lines.length - 1;
    return `<div class="${pill ? 'pill' : 'line'}" style="font-size:${Math.round((pill ? 54 : 46) * scale)}px; margin-top:${Math.round((pill ? 34 : 40) * scale)}px">${esc(t)}</div>`;
  }).join('');
  return page(`<div class="wrap">${card.logo ? `<img src="${logo}" style="width:${Math.round(860 * scale)}px">` : ''}${lines}</div>`);
}

// The vertical cut's frame: logo above the square gameplay window, cream below for captions and the URL.
function verticalFrameHtml(w, h, square, top, logo, url) {
  const bottom = top + square;
  return page(`
    <div style="position:absolute; left:0; right:0; top:0; height:${top}px; display:flex; align-items:center; justify-content:center"><img src="${logo}" style="width:${Math.round(w * 0.7)}px"></div>
    <div style="position:absolute; left:0; top:${top}px; width:${w}px; height:${square}px; background:#000"></div>
    <div style="position:absolute; left:0; right:0; bottom:0; height:${Math.round((h - bottom) * 0.4)}px; display:flex; align-items:center; justify-content:center"><div class="pill" style="font-size:40px">${esc(url)}</div></div>`);
}

function captionHtml(text, w, fontPx) {
  return page(`<div class="wrap"><div class="cap" style="font-size:${fontPx}px; max-width:${Math.round(w * 0.86)}px">${esc(text)}</div></div>`, { transparent: true });
}

async function shoot(browser, html, w, h, file, { transparent = false, key = '' } = {}) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.setContent(html, { waitUntil: 'networkidle' });
  const font = await p.evaluate(async () => { await document.fonts.load('600 40px Fredoka'); await document.fonts.load('700 40px Fredoka'); await document.fonts.ready; return document.fonts.check('600 40px Fredoka') && document.fonts.check('700 40px Fredoka'); });
  if (!font) throw new Error(`trailer: the Fredoka web font did not load for ${key || file}; the cards need network access to Google Fonts`);
  await p.screenshot({ path: file, omitBackground: transparent });
  await p.close();
  return file;
}

// Writes every graphic into dir and returns their paths.
export async function renderGraphics({ dir, cards, lines, output, logoPath, url }) {
  const logo = `data:image/png;base64,${readFileSync(logoPath).toString('base64')}`;
  const { width: W, height: H } = output;
  const V = output.vertical;
  const square = V.width;
  const top = Math.round((V.height - square) * 0.42);
  const browser = await chromium.launch();
  const out = { cards: {}, vcards: {}, captions: {}, vcaptions: {}, vframe: null, vlayout: { square, top } };
  try {
    for (const [id, card] of Object.entries(cards)) {
      out.cards[id] = await shoot(browser, cardHtml(card, W, H, logo), W, H, join(dir, `card-${id}.png`), { key: id });
      if (V) out.vcards[id] = await shoot(browser, cardHtml(card, V.width, V.height, logo), V.width, V.height, join(dir, `vcard-${id}.png`), { key: id });
    }
    for (const l of lines) {
      out.captions[l.id] = await shoot(browser, captionHtml(l.text, W, 42), W, 180, join(dir, `cap-${l.id}.png`), { transparent: true, key: l.id });
      if (V) out.vcaptions[l.id] = await shoot(browser, captionHtml(l.text, V.width, 44), V.width, 260, join(dir, `vcap-${l.id}.png`), { transparent: true, key: l.id });
    }
    if (V) out.vframe = await shoot(browser, verticalFrameHtml(V.width, V.height, square, top, logo, url), V.width, V.height, join(dir, 'vframe.png'));
  } finally {
    await browser.close();
  }
  return out;
}
