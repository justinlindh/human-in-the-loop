import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toolTmp } from '../../scripts/tools/tmp.mjs';
import { checkoutMismatch, checkoutOf } from '../../blender/checks/checkout.mjs';

const tmp = mkdtempSync(join(toolTmp(), 'checkout-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const A = 'a'.repeat(40), B = 'b'.repeat(40);

describe('checkout stamp', () => {
  it('reads the head and whether tracked files changed, ignoring untracked ones', () => {
    const repo = join(tmp, 'repo');
    const g = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' }).trim();
    execFileSync('git', ['init', '-q', repo]);
    writeFileSync(join(repo, 'f'), '1');
    g('add', 'f');
    g('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'x');
    const head = g('rev-parse', 'HEAD');
    writeFileSync(join(repo, 'untracked'), '');
    expect(checkoutOf(repo)).toEqual({ commit: head, dirty: false });
    writeFileSync(join(repo, 'f'), '2');
    expect(checkoutOf(repo)).toEqual({ commit: head, dirty: true });
    expect(checkoutOf(tmp)).toBe(null);
  });

  it('says why a report may not match, in one line, and nothing when it should', () => {
    expect(checkoutMismatch({}, { commit: A, dirty: false })).toBe("report has no commit; can't check it was made from this checkout");
    expect(checkoutMismatch({ checkout: { commit: A, dirty: false } }, null)).toBe("this is not a git checkout; can't check the report was made from it");
    expect(checkoutMismatch({ checkout: { commit: A, dirty: false } }, { commit: A, dirty: false })).toBe(null);
    expect(checkoutMismatch({ checkout: { commit: A, dirty: true } }, { commit: B, dirty: false })).toBe('report made at aaaaaaaa (with uncommitted changes), this checkout is at bbbbbbbb: its scenes may differ');
    expect(checkoutMismatch({ checkout: { commit: A, dirty: false } }, { commit: A, dirty: true })).toBe('report made at aaaaaaaa, as this checkout is, but this checkout has uncommitted changes: its scenes may differ');
    expect(checkoutMismatch({ checkout: { commit: A, dirty: true } }, { commit: A, dirty: true })).toMatch(/but both had uncommitted changes/);
  });
});
