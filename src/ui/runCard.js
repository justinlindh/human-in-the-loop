// The end-of-run share card: what the run came to, drawn on a canvas in the game's own type and palette, so the
// picture players save is exactly the one they see. Everything is built in the browser; nothing leaves it.
import { fmtMoney, fmtNum } from './dom.js';
import { B } from '../sim/balance.js';
import { ERA_STARTS, CAREER_MODES, careerMode } from '../data/era-modes.js';
import { erasPreview } from './eraPreview.js';

export const CARD_W = 1200;
export const CARD_H = 630;
const WEEKS_PER_YEAR = 52;
const SITE = 'humanintheloopgame.com';
const C = { ink: '#2a2630', inkSoft: '#5b5361', cream: '#fbf5ea', cream3: '#e9dbc2', yellow: '#ffb020', blue: '#4f8cff', lost: '#cfc6d6' };

// What the card says, from the finished game. `title` is the end screen's headline, `score` its final score.
export function runCardData(s, { title, score }) {
  const mode = careerMode(s);
  const start = s.founding?.startEra;
  const startName = ERA_STARTS[start]?.name;
  let route = 'Classic SaaS';
  if (mode === 'long_career') route = CAREER_MODES.long_career.name;
  else if (erasPreview && startName && start !== 'classic') route = startName;
  const share = erasPreview && start && start !== 'classic' ? B.eraStarts[start]?.scoreShare : null;
  const years = Math.floor((s.week ?? 0) / WEEKS_PER_YEAR);
  return {
    company: s.companyName || 'Your company',
    initial: (s.companyName || '?').slice(0, 1).toUpperCase(),
    logoColor: s.logoColor ?? s.founding?.logoColor ?? C.yellow,
    route,
    years,
    ending: title,
    won: !!s.gameOver?.won,
    score: Math.round(score ?? 0),
    share: share != null && share < 1 ? Math.round(share * 100) : null,
    stats: [
      ['Peak MRR', fmtMoney(s.stats?.peakMrr ?? 0)],
      ['Launches', fmtNum(s.stats?.launches ?? 0)],
      ['People hired', fmtNum(s.stats?.hires ?? 0)],
    ],
  };
}

export const cardFileName = (data) => `${data.company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-company'}-human-in-the-loop.png`;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Shrinks the font until the text fits the width.
function fit(ctx, text, weight, size, maxW) {
  let px = size;
  ctx.font = `${weight} ${px}px Fredoka, system-ui, sans-serif`;
  while (px > 18 && ctx.measureText(text).width > maxW) { px -= 2; ctx.font = `${weight} ${px}px Fredoka, system-ui, sans-serif`; }
  return px;
}

export async function drawRunCard(data, canvas = document.createElement('canvas')) {
  try { await Promise.all([document.fonts.load('700 40px Fredoka'), document.fonts.load('600 40px Fredoka')]); } catch { /* the system font stands in */ }
  canvas.width = CARD_W; canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.cream; ctx.fillRect(0, 0, CARD_W, CARD_H);
  // Frame with a sticker shadow.
  ctx.fillStyle = C.cream3; roundRect(ctx, 24, 32, CARD_W - 48, CARD_H - 48, 36); ctx.fill();
  ctx.fillStyle = C.cream; roundRect(ctx, 24, 24, CARD_W - 48, CARD_H - 48, 36); ctx.fill();
  ctx.lineWidth = 8; ctx.strokeStyle = C.ink; ctx.stroke();
  // The ending banner.
  ctx.save(); roundRect(ctx, 24, 24, CARD_W - 48, 150, 36); ctx.clip();
  ctx.fillStyle = data.won ? C.yellow : C.lost; ctx.fillRect(0, 0, CARD_W, 174);
  ctx.restore();
  ctx.fillStyle = C.ink; ctx.fillRect(28, 170, CARD_W - 56, 8);
  // Logo tile and company.
  ctx.fillStyle = data.logoColor; roundRect(ctx, 64, 52, 96, 96, 22); ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = C.ink; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = '700 62px Fredoka, system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(data.initial, 112, 122);
  ctx.textAlign = 'left'; ctx.fillStyle = C.ink;
  fit(ctx, data.company, 700, 58, 760);
  ctx.fillText(data.company, 184, 98);
  ctx.fillStyle = C.inkSoft; ctx.font = '600 28px Fredoka, system-ui, sans-serif';
  ctx.fillText(`${data.route} · ${data.years} ${data.years === 1 ? 'year' : 'years'} survived`, 186, 138);
  // Ending headline.
  ctx.fillStyle = C.ink;
  fit(ctx, data.ending, 700, 76, CARD_W - 140);
  ctx.fillText(data.ending, 64, 276);
  // Score block.
  ctx.fillStyle = C.inkSoft; ctx.font = '600 28px Fredoka, system-ui, sans-serif';
  ctx.fillText('FINAL SCORE', 64, 346);
  ctx.fillStyle = C.ink; ctx.font = '700 120px Fredoka, system-ui, sans-serif';
  ctx.fillText(fmtNum(data.score), 60, 450);
  if (data.share != null) {
    ctx.fillStyle = C.inkSoft; ctx.font = '600 26px Fredoka, system-ui, sans-serif';
    ctx.fillText(`This start scores ${data.share}% of a Classic run`, 64, 492);
  }
  // Highlight stats in sticker tiles on the right.
  const tileW = 270, tileH = 96, gap = 18, x = CARD_W - 64 - tileW;
  data.stats.forEach(([label, value], i) => {
    const y = 214 + i * (tileH + gap);
    ctx.fillStyle = '#fff'; roundRect(ctx, x, y, tileW, tileH, 20); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = C.ink; ctx.stroke();
    ctx.fillStyle = C.inkSoft; ctx.font = '600 24px Fredoka, system-ui, sans-serif'; ctx.fillText(label, x + 22, y + 36);
    ctx.fillStyle = C.ink; ctx.font = '700 42px Fredoka, system-ui, sans-serif'; ctx.fillText(value, x + 22, y + 80);
  });
  // Footer.
  ctx.fillStyle = C.ink; ctx.font = '700 30px Fredoka, system-ui, sans-serif'; ctx.fillText('Human in the Loop', 64, CARD_H - 52);
  ctx.textAlign = 'right'; ctx.fillStyle = C.inkSoft; ctx.font = '600 26px Fredoka, system-ui, sans-serif';
  ctx.fillText(SITE, CARD_W - 64, CARD_H - 52);
  ctx.textAlign = 'left';
  return canvas;
}

const toBlob = (canvas) => new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The picture could not be made'))), 'image/png'));

export async function saveRunCard(canvas, name) {
  const blob = await toBlob(canvas);
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export const canCopyImage = () => typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write;

export async function copyRunCard(canvas) {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': toBlob(canvas) })]);
}
