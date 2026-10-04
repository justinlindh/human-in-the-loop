import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { segments, shellWrites, ownersOf, branchSwitch, parseNotice, noticeNote, stripTrailers } from '../../scripts/tools/mods/hitl-guards/hooks/rules.ts';

const LANES = readFileSync(resolve(__dirname, '../../scripts/hooks/claude/lanes.txt'), 'utf8');
const paths = (cmd) => shellWrites(cmd).map((w) => `${w.how}: ${w.path}`);

describe('hitl-guards rules', () => {
  it('splits a chain outside quotes and keeps a heredoc body off the words', () => {
    const s = segments(`cd a && echo "x && y" | tee b; cat > c.md <<'EOF'\nline > d\nEOF\necho done`);
    expect(s.map((x) => x.words[0])).toEqual(['cd', 'echo', 'tee', 'cat', 'echo']);
    expect(s[1].words).toEqual(['echo', 'x && y']);
    expect(s[3].heredoc).toBe('line > d');
  });

  it('finds the files a command writes from the shell', () => {
    expect(paths("sed -i 's/a/b/' src/render/x.js")).toEqual(['sed -i: src/render/x.js']);
    expect(paths("sed -i.bak -e 's/a/b/' -e 's/c/d/' a.js b.js")).toEqual(['sed -i: a.js', 'sed -i: b.js']);
    expect(paths('perl -pi -e "s/a/b/" docs/x.md')).toEqual(['perl -i: docs/x.md']);
    expect(paths("cat > docs/toolkit/x.md <<'EOF'\nhello\nEOF")).toEqual(['a shell redirect (>): docs/toolkit/x.md']);
    expect(paths('echo hi >> notes.txt 2>/dev/null')).toEqual(['a shell redirect (>>): notes.txt']);
    expect(paths('git log | tee -a out.log')).toEqual(['tee: out.log']);
    expect(paths(`python3 - <<'PY'\nopen('src/ui/a.js', 'w').write(s)\nPY`)).toEqual(['python code: src/ui/a.js']);
    expect(paths(`nice -n 10 node -e "require('fs').writeFileSync('package.json', x)"`)).toEqual(['node code: package.json']);
  });

  it('reads malformed and empty commands without throwing', () => {
    for (const cmd of ['', '   ', "sed -i 's/a/b x.js", 'echo "unclosed > f', 'cat <<EOF', '>', '| |', 'git checkout', 'cd && git switch']) {
      expect(() => { shellWrites(cmd); branchSwitch(cmd); segments(cmd); }, cmd).not.toThrow();
    }
    expect(shellWrites('echo "unclosed > f')).toEqual([]);
    expect(branchSwitch('git checkout')).toBe(null);
    expect(parseNotice('<output-file></output-file>')).toBe(null);
  });

  it('gives each write the directory the last cd before it leads to', () => {
    expect(shellWrites("cd ../w && cd docs && sed -i 's/a/b/' x.md; echo > y").map((w) => [w.path, w.dir])).toEqual([['x.md', '../w/docs'], ['y', '../w/docs']]);
    expect(shellWrites('tee a.log < b')[0].dir).toBe(null);
  });

  it('leaves reads, in-memory sed and stderr merges alone', () => {
    expect(paths("sed -n 1,20p src/x.js")).toEqual([]);
    expect(paths('grep -c x a.log 2>&1 | head')).toEqual([]);
    expect(paths("python3 -c 'print(open(\"a.json\").read())'")).toEqual([]);
    expect(paths('node scripts/x.mjs > /dev/null')).toEqual([]);
  });

  it('names the lane that owns a path, the longest listed path winning', () => {
    expect(ownersOf('scripts/tools/job.sh', LANES)).toEqual(['tools']);
    expect(ownersOf('scripts/ci-pr.sh', LANES)).toEqual(['integ']);
    expect(ownersOf('src/render/character.js', LANES)).toEqual(['art']);
    expect(ownersOf('src/audio/x.js', LANES).sort()).toEqual(['audio', 'ui']);
    expect(ownersOf('nowhere/x', LANES)).toEqual([]);
  });

  it('finds a branch switch and the directory it runs in', () => {
    expect(branchSwitch('cd ../gamedev-tools && git checkout -b tools/x origin/main')).toEqual({ dir: '../gamedev-tools', maybeRef: null });
    expect(branchSwitch('git -C /w switch main')).toEqual({ dir: '/w', maybeRef: null });
    expect(branchSwitch('cd /w && git checkout tools/clip-engine')).toEqual({ dir: '/w', maybeRef: 'tools/clip-engine' });
    expect(branchSwitch('git checkout -- src/a.js')).toBe(null);
    expect(branchSwitch('git checkout HEAD~1 -- a.js')).toBe(null);
    expect(branchSwitch('git checkout .')).toBe(null);
    expect(branchSwitch('git status && git log')).toBe(null);
  });

  it('reads a background task notification and flags a check that printed no rows', () => {
    const text = '<task-notification>\n<task-id>b1</task-id>\n<output-file>/tmp/t/b1.output</output-file>\n<status>completed</status>\n<summary>Background command "cd /w &amp;&amp; node blender/checks/clip.mjs" completed (exit code 0)</summary>\n</task-notification>';
    const n = parseNotice(text);
    expect(n).toEqual({ outputFile: '/tmp/t/b1.output', status: 'completed', exitCode: 0, command: 'cd /w && node blender/checks/clip.mjs' });
    expect(noticeNote(n, 'harness: GL gpu\n')).toContain('exit 0, no result rows');
    expect(noticeNote(n, 'CLIP ok   desk:f1 {}\nclip: 1 of 1 passed\n')).not.toContain('no result rows');
    expect(noticeNote({ ...n, command: 'ls' }, '')).not.toContain('no result rows');
    expect(parseNotice('no notification here')).toBe(null);
  });

  it('drops session trailers from commits and PR text and leaves other commands alone', () => {
    const commit = "git commit -m \"$(cat <<'EOF'\nfix(ui): x\n\nClaude-Session: https://claude.ai/code/session_01ABC\nEOF\n)\"";
    expect(stripTrailers(commit)).toBe("git commit -m \"$(cat <<'EOF'\nfix(ui): x\n\nEOF\n)\"");
    expect(stripTrailers('gh pr create --body "text\nhttps://claude.ai/code/session_01ABC\n"')).toBe('gh pr create --body "text\n"');
    expect(stripTrailers('gh pr edit 5 --body "a\r\n  Claude-Session: x\r\nb"')).toBe('gh pr edit 5 --body "a\r\nb"');
    expect(stripTrailers('gh pr comment 5 --body "see https://claude.ai/code/session_01ABC inline"')).toBe('gh pr comment 5 --body "see https://claude.ai/code/session_01ABC inline"');
    expect(stripTrailers('git commit -m "fix(ui): x\n\nClaude-Session: https://claude.ai/code/session_01ABC"')).toBe('git commit -m "fix(ui): x\n\n"');
    expect(stripTrailers("gh pr create --body 'a\nhttps://claude.ai/code/session_01ABC'")).toBe("gh pr create --body 'a\n'");
    expect(stripTrailers('echo Claude-Session: x')).toBe('echo Claude-Session: x');
    expect(stripTrailers('gh pr view 5')).toBe('gh pr view 5');
  });
});
