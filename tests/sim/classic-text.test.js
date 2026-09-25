import { describe, it, expect } from 'vitest';
import { leaks } from './_runs.js';

// The full-run scan (every bot, several seeds, nothing readable in Classic mentions AI) is in full-runs.test.js.
describe('issue #10: no AI talk before the ChatGBT moment', () => {
  it('the scanner itself catches the obvious cases and ignores ordinary words', () => {
    for (const bad of ['The AI is fine.', 'Our agent rewrote pricing', 'a new model', 'prompt engineering', 'GPT wrapper', 'Claudius is down']) expect(leaks(bad), bad).toBe(true);
    for (const ok of ['Aiko shipped it', 'Maida fixed the build', 'Pairing today was fun', 'The office plant is thriving', 'Main street']) expect(leaks(ok), ok).toBe(false);
  });
});
