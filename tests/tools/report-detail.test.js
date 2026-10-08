import { describe, expect, it, vi } from 'vitest';
import { createReport, pageErrorDetail } from '../../blender/checks/report.mjs';

describe('a failing row with a detail', () => {
  it('pageErrorDetail keeps the first two messages and counts the rest', () => {
    expect(pageErrorDetail(['a', 'b'])).toBe('a | b');
    expect(pageErrorDetail(['TypeError: x\n    at y', 'b', 'c', 'd'])).toBe('TypeError: x at y | b (+2 more)');
    expect(pageErrorDetail(['z'.repeat(500)])).toHaveLength(200);
  });

  it('the report prints the detail of a failing row under the table, and a passing row prints none', () => {
    const lines = [];
    const log = vi.spyOn(console, 'log').mockImplementation((s) => lines.push(String(s)));
    try {
      const rep = createReport('stage');
      rep.row({ check: 'letter', view: 'default', beat: '-', metric: 'pageErrors', value: 3, want: '0', pass: false, detail: pageErrorDetail(['boom', 'bang', 'x']) });
      rep.row({ check: 'letter', view: 'turned', beat: '-', metric: 'pageErrors', value: 0, want: '0', pass: true, detail: 'not shown' });
      rep.finish();
    } finally { log.mockRestore(); }
    expect(lines).toContain('STAGE detail letter default pageErrors: boom | bang (+1 more)');
    expect(lines.join('\n')).not.toContain('not shown');
  });
});
