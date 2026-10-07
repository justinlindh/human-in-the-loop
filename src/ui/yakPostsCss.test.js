import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

// The picker is a scrolling flex column: a row must not shrink below its text, or the description overprints the next row.
it('post menu rows keep their content height', () => {
  const css = readFileSync(new URL('./styles/30-yak-posts.css', import.meta.url), 'utf8');
  const rule = css.match(/\.hitl \.ypost-opt \{([^}]*)\}/)?.[1] ?? '';
  expect(rule).toMatch(/flex:\s*none/);
});
