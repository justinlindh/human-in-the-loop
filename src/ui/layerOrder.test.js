import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = (f) => readFileSync(new URL(`./styles/${f}`, import.meta.url), 'utf8');
const z = (file, selector) => {
  const m = new RegExp(`${selector.replace(/[.]/g, '\\.')}\\s*\\{[^}]*z-index:\\s*(\\d+)`).exec(css(file));
  return m ? Number(m[1]) : null;
};

describe('overlay layer order', () => {
  it('keeps decisions above the big Yak view and below the era card that introduces them', () => {
    const yak = z('23-yak-sizes.css', '.hitl .yak-back');
    const popup = z('23-yak-sizes.css', '.hitl .modal-back.popup-back');
    const era = z('15-announcements.css', '.hitl .announce-back');
    expect(yak).not.toBeNull();
    expect(popup).toBeGreaterThan(yak);
    expect(era).toBeGreaterThan(popup);
  });
});
