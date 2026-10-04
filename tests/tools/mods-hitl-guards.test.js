import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { segments, shellWrites, ownersOf, branchSwitch, parseNotice, noticeNote, stripTrailers, createdPr, heldPr, isRenderJob, loadOf, repoRelative } from '../../scripts/tools/mods/hitl-guards/hooks/rules.ts';

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
    expect(paths(`node -e "require('fs').writeFileSync('/home/u/w/src/sim/balance.js', s)"`)).toEqual(['node code: /home/u/w/src/sim/balance.js']);
    expect(paths(`python3 -c "open('./notes.md', mode='a').write('x')"`)).toEqual(['python code: ./notes.md']);
    expect(paths(`python3 - <<'PY'\nfrom pathlib import Path\nPath('docs/x.md').write_text(t)\nPY`)).toEqual(['python code: docs/x.md']);
  });

  it('takes only the path a Python or Node write call names, not files the code reads', () => {
    expect(paths(`python3 -c "import json,sys; d=json.load(open('package.json')); sys.stdout.write(d['name'])"`)).toEqual([]);
    expect(paths(`node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync('package.json','utf8')); fs.writeFileSync('/var/tmp/out.json', JSON.stringify(d))"`)).toEqual(['node code: /var/tmp/out.json']);
    expect(paths(`python3 -c "p='a.js'; open(p, 'w').write('x')"`)).toEqual([]);
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
    const text = '<task-notification>\n<task-id>b1</task-id>\n<output-file>/w/t/b1.output</output-file>\n<status>completed</status>\n<summary>Background command "cd /w &amp;&amp; node blender/checks/clip.mjs" completed (exit code 0)</summary>\n</task-notification>';
    const n = parseNotice(text);
    expect(n).toEqual({ outputFile: '/w/t/b1.output', status: 'completed', exitCode: 0, command: 'cd /w && node blender/checks/clip.mjs' });
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

  it('names the PR a non-draft gh pr create opened, and nothing for a draft or another command', () => {
    const out = 'Creating pull request\nhttps://github.com/me/repo/pull/1234\n';
    const url = 'https://github.com/me/repo/pull/1234';
    expect(createdPr('gh pr create --base main --head tools/x --title t --body-file pr.tmp', out)).toBe(url);
    expect(createdPr('cp a pr.tmp && gh pr create --title t', out)).toBe(url);
    expect(createdPr('cd ../site && gh pr create --title t', 'https://github.com/me/site/pull/12\n')).toBe('https://github.com/me/site/pull/12');
    expect(createdPr('gh pr create --draft --title t', out)).toBeUndefined();
    expect(createdPr('gh pr create -d --title t', out)).toBeUndefined();
    expect(createdPr('gh pr view 5', out)).toBeUndefined();
    expect(createdPr('echo gh pr create', out)).toBeUndefined();
    expect(createdPr('gh pr create --title t', 'no url printed')).toBeUndefined();
  });

  it('holds a PR back from auto-merge when it is a draft or labelled for the owner or Codex', () => {
    expect(heldPr({ isDraft: true })).toBe('draft');
    expect(heldPr({ labels: [{ name: 'awaiting-user' }] })).toBe('label');
    expect(heldPr({ labels: [{ name: 'codex' }] })).toBe('label');
    expect(heldPr({ labels: [{ name: 'tooling' }] })).toBe(null);
    expect(heldPr({})).toBe(null);
  });

  it('knows a render or capture command from one that only mentions it', () => {
    for (const c of ['node blender/checks/golden.mjs', 'nice -n 10 node blender/checks/stage.mjs --only=a', 'scripts/with-render-lock.sh --gpu node scripts/capture.js --manifest m', 'npm run capture -- --only x', 'node scripts/perf/bench.js --refs a,b', 'cd ../w && timeout 600 node scripts/reels/era-snaps.mjs preinternet 7 "x=1"', 'npm run gates -- --only clip']) expect(isRenderJob(c), c).toBe(true);
    for (const c of ['git commit -m "fix: blender/checks/golden.mjs"', 'grep -n capture scripts/capture.js', 'cat blender/checks/stage.mjs', 'gh pr comment 5 --body "ran node blender/checks/clip.mjs"', 'npm run test:push', 'ls scripts/reels/', 'node scripts/feature-media/check.mjs']) expect(isRenderJob(c), c).toBe(false);
    expect(isRenderJob('node scripts/feature-media/render.mjs --all')).toBe(true);
  });

  it('reads the 1-minute load from /proc/loadavg text', () => {
    expect(loadOf('41.52 38.10 30.00 3/900 1234\n')).toBe(41.52);
    expect(loadOf('')).toBe(null);
    expect(loadOf('x y z')).toBe(null);
  });

  it('makes this checkout and sibling worktree paths in gh pr text repo-relative, and only there', () => {
    const body = 'gh pr create --body "see /home/u/src/gamedev-tools2/docs/toolkit/x.md and /home/u/src/gamedev-art/src/render/a.js, log /home/u/.cache/hitl-ci/t.log"';
    const roots = ['/home/u/src/gamedev-tools2', '/home/u/src/gamedev-art'];
    expect(repoRelative(body, roots)).toBe('gh pr create --body "see docs/toolkit/x.md and src/render/a.js, log /home/u/.cache/hitl-ci/t.log"');
    expect(repoRelative('gh pr comment 5 --body "/w/docs/a.md"', ['/w'])).toBe('gh pr comment 5 --body "docs/a.md"');
    expect(repoRelative('gh pr create --title=/w/x --body \'/w/y\'', ['/w'])).toBe('gh pr create --title=x --body \'y\'');
    expect(repoRelative('echo /home/u/src/gamedev/docs/a.md', ['/home/u/src/gamedev'])).toBe('echo /home/u/src/gamedev/docs/a.md');
    expect(repoRelative('git commit -m "/w/docs/a.md"', ['/w'])).toBe('git commit -m "/w/docs/a.md"');
  });

  it('rewrites nothing but the --body and --title values', () => {
    const roots = ['/w'];
    for (const c of ['cd /w/sub && gh pr create --fill', 'gh pr create --body-file /w/pr.tmp --title t', 'gh pr comment 5 --body "see /home/u/src/other/docs/a.md"', 'gh pr create --head /w/x']) expect(repoRelative(c, roots), c).toBe(c);
    expect(repoRelative('cd /w && gh pr create --body-file /w/p.tmp --title "/w/t"', roots)).toBe('cd /w && gh pr create --body-file /w/p.tmp --title "t"');
  });
});
