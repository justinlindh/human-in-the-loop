// Pure command parsing for the hitl-guards hooks: no `$`, no I/O, so vitest (tests/tools/mods-hitl-guards.test.js)
// and `claude plugin test` both exercise it directly.

// A command split into its segments at &&, ||, ;, | and newlines outside quotes, each segment's words with
// their quotes removed. A heredoc body (the lines after `<<WORD` up to WORD) is kept out of the words and
// returned on the segment as `heredoc`.
export type Segment = { words: string[]; text: string; heredoc?: string };

export function segments(command: string): Segment[] {
  const out: Segment[] = [];
  let words: string[] = [], word = '', text = '', quote: string | null = null, hasWord = false;
  const endWord = () => { if (hasWord) words.push(word); word = ''; hasWord = false; };
  const endSeg = () => { endWord(); if (words.length) out.push({ words, text: text.trim() }); words = []; text = ''; };
  const lines = command.split('\n');
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quote) { if (c === quote) quote = null; else if (c === '\\' && quote === '"' && i + 1 < line.length) { word += line[++i]; } else word += c; text += c; continue; }
      if (c === "'" || c === '"') { quote = c; hasWord = true; text += c; continue; }
      if (c === '\\' && i + 1 < line.length) { word += line[++i]; hasWord = true; text += c + line[i]; continue; }
      if (c === '#' && !hasWord) break;
      if (c === ' ' || c === '\t') { endWord(); text += c; continue; }
      if (c === '&' && line[i + 1] === '&') { endSeg(); i++; continue; }
      if (c === '|' && line[i + 1] === '|') { endSeg(); i++; continue; }
      if (c === ';' || c === '|') { endSeg(); continue; }
      if (c === '>' || c === '<') {
        endWord();
        let op = c; while (line[i + 1] === '>' || line[i + 1] === '<' || line[i + 1] === '&') op += line[++i];
        words.push(op); text += op; continue;
      }
      word += c; hasWord = true; text += c;
    }
    if (quote) { word += '\n'; text += '\n'; continue; }
    // A heredoc on this line: its body runs to the terminator line and belongs to this segment.
    const at = words.findIndex((w) => w === '<<' || w === '<<-');
    const term = (at >= 0 ? words[at + 1] ?? (hasWord ? word : '') : '').replace(/^-/, '');
    endWord();
    if (term) {
      const body: string[] = [];
      while (li + 1 < lines.length && lines[li + 1].trim() !== term) body.push(lines[++li]);
      li++;
      const seg = { words, text: text.trim(), heredoc: body.join('\n') };
      out.push(seg); words = []; text = '';
      continue;
    }
    endSeg();
  }
  endSeg();
  return out;
}

// The command a segment runs, past leading env assignments and wrappers (nice, timeout, env, uv run).
export function commandOf(words: string[]): { cmd: string; args: string[] } {
  let i = 0;
  const skipOpts = () => { while (i < words.length && words[i].startsWith('-')) i++; };
  for (;;) {
    if (i >= words.length) return { cmd: '', args: [] };
    const w = words[i];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) { i++; continue; }
    if (w === 'nice' || w === 'env' || w === 'command' || w === 'exec') { i++; if (w === 'nice' && words[i] === '-n') i += 2; skipOpts(); continue; }
    if (w === 'timeout') { i++; skipOpts(); i++; continue; }
    if (w === 'uv' && words[i + 1] === 'run') { i += 2; skipOpts(); continue; }
    if (w === 'sudo') { i++; continue; }
    return { cmd: w.replace(/^.*\//, ''), args: words.slice(i + 1) };
  }
}

const isRedirect = (w: string) => /^(\d*)(>>?|&>>?)$/.test(w);
const notAFile = (p: string) => !p || p.startsWith('/dev/') || p.startsWith('&') || /^\d+$/.test(p) || p.startsWith('$(') || p.startsWith('<(');

// Files a command writes from the shell instead of through Edit or Write: sed -i, perl -i, a redirect
// (`> f`, `>> f`, `cat > f <<EOF`), tee, and Python or Node code that opens a path for writing. Each with
// how it writes, for the message.
// `dir` is the directory the write runs in: the last `cd` before it in the chain, or null for the
// session's own.
export type ShellWrite = { path: string; how: string; dir: string | null };

// The directory a `cd` leads to from `dir` (null is the session's directory).
const cdTo = (dir: string | null, arg: string | undefined) => (!arg || arg.startsWith('-') ? null : dir && !arg.startsWith('/') && !arg.startsWith('~') ? `${dir}/${arg}` : arg);

export function shellWrites(command: string): ShellWrite[] {
  const found: Omit<ShellWrite, 'dir'>[][] = [];
  const dirs: (string | null)[] = [];
  let dir: string | null = null;
  for (const seg of segments(command)) {
    const out: Omit<ShellWrite, 'dir'>[] = [];
    found.push(out); dirs.push(dir);
    const { words } = seg;
    for (let i = 0; i < words.length - 1; i++) if (isRedirect(words[i]) && !notAFile(words[i + 1])) out.push({ path: words[i + 1], how: `a shell redirect (${words[i]})` });
    const plain = words.filter((w, i) => !isRedirect(w) && !isRedirect(words[i - 1] ?? '') && w !== '<<' && w !== '<<-' && !((words[i - 1] === '<<' || words[i - 1] === '<<-')));
    const { cmd, args } = commandOf(plain);
    if (cmd === 'cd') { dir = cdTo(dir, args[0]); continue; }
    if (cmd === 'sed' || cmd === 'perl') {
      const inPlace = args.some((a) => (cmd === 'sed' ? /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place') : /^-[a-zA-Z]*i/.test(a)));
      if (!inPlace) continue;
      // The script is the first non-option word unless -e or -f gave it.
      const scripted = args.some((a, k) => (a === '-e' || a === '-f' || a === '--expression') && args[k + 1] !== undefined);
      const rest: string[] = [];
      for (let k = 0; k < args.length; k++) {
        const a = args[k];
        if (a === '-e' || a === '-f' || a === '--expression') { k++; continue; }
        if (a.startsWith('-')) continue;
        rest.push(a);
      }
      for (const p of scripted ? rest : rest.slice(1)) out.push({ path: p, how: `${cmd} -i` });
    } else if (cmd === 'tee') {
      for (const a of args) if (!a.startsWith('-') && !notAFile(a)) out.push({ path: a, how: 'tee' });
    } else if (/^(python[0-9.]*|node)$/.test(cmd)) {
      const code = [seg.heredoc ?? '', ...args].join('\n');
      // Only the path a write call names: the first argument of writeFile(Sync)/appendFile(Sync)/
      // createWriteStream, open(path, 'w'|'a'|'x'), or the receiver of Path(path).write_text/bytes.
      // A path held in a variable isn't known here and passes; .write( alone (stdout, a handle) names none.
      const LIT = String.raw`(['"\x60])([^'"\x60\n]+)\1`;
      const calls = [
        new RegExp(String.raw`\b(?:writeFileSync|appendFileSync|writeFile|appendFile|createWriteStream)\(\s*${LIT}`, 'g'),
        new RegExp(String.raw`\bopen\(\s*${LIT}\s*,\s*(?:mode\s*=\s*)?['"][rb]*[wax]`, 'g'),
        new RegExp(String.raw`\bPath\(\s*${LIT}\s*\)\s*\.\s*write_(?:text|bytes)\(`, 'g'),
      ];
      const paths = calls.flatMap((re) => [...code.matchAll(re)].map((m) => m[2] ?? ''));
      for (const p of new Set(paths)) if (p && !notAFile(p)) out.push({ path: p, how: cmd.startsWith('node') ? 'node code' : 'python code' });
    }
  }
  return found.flatMap((ws, i) => ws.map((w) => ({ ...w, dir: dirs[i] })));
}

// The lanes that own a repo-relative path by scripts/hooks/claude/lanes.txt: the lanes whose listed
// path matches it longest (`src/audio/` is ui's and audio's). `*`, main and lead are not owner lanes.
export function ownersOf(path: string, lanesTxt: string): string[] {
  let best = -1, owners: string[] = [];
  for (const line of lanesTxt.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const [lane, ...paths] = t.split(/\s+/);
    if (lane === '*' || lane === 'main' || lane === 'lead') continue;
    for (const p of paths) {
      const hit = p.endsWith('/') ? path.startsWith(p) : path === p;
      if (!hit) continue;
      if (p.length > best) { best = p.length; owners = [lane]; } else if (p.length === best && !owners.includes(lane)) owners.push(lane);
    }
  }
  return owners;
}

// A branch switch in a command: `git checkout <ref>`, `git checkout -b x`, `git switch ...`, with the
// directory it runs in (the last `cd` before it in the chain, or `git -C`), or null when it runs in the
// session's directory. A checkout that restores files (`--`, `-p`, `.`) is not a switch; one whose only
// argument might be a path or a ref says so with `maybeRef`, for the caller to ask git.
export type BranchSwitch = { dir: string | null; maybeRef: string | null };

export function branchSwitch(command: string): BranchSwitch | null {
  let dir: string | null = null;
  for (const seg of segments(command)) {
    const { cmd, args } = commandOf(seg.words);
    if (cmd === 'cd') { dir = cdTo(dir, args[0]); continue; }
    if (cmd !== 'git') continue;
    let k = 0, here = dir;
    while (k < args.length && args[k].startsWith('-')) { if (args[k] === '-C') { here = args[k + 1]; k += 2; } else if (args[k] === '-c') k += 2; else k++; }
    const sub = args[k], rest = args.slice(k + 1);
    if (sub === 'switch') { if (rest.includes('--help') || rest.includes('-h')) continue; return { dir: here, maybeRef: null }; }
    if (sub !== 'checkout') continue;
    if (rest.includes('--') || rest.includes('-p') || rest.includes('--patch') || rest.includes('.')) continue;
    if (rest.some((a) => ['-b', '-B', '--orphan', '--detach', '-'].includes(a))) return { dir: here, maybeRef: null };
    const plain = rest.filter((a) => !a.startsWith('-'));
    if (plain.length !== 1) continue;
    return { dir: here, maybeRef: plain[0] };
  }
  return null;
}

// Session trailers the commit-msg hook refuses, dropped from commit messages and PR text before the
// command runs (it would otherwise fail after the gate and lose the commit). A quote closing the
// message on the same line stays.
const TRAILER = /^[ \t]*(Claude-Session:[^\r\n"']*|https:\/\/claude\.ai\/code\/session_[^\s"']+)[ \t]*\r?\n?/gm;

export function stripTrailers(command: string): string {
  return /\b(git\s+commit|gh\s+pr\s+(create|edit|comment))\b/.test(command) ? command.replace(TRAILER, '') : command;
}

// The PR a non-draft `gh pr create` opened, from the URL it printed; undefined for a draft, another
// command, or output with no PR URL.
// The URL is what the caller passes to `gh pr view|merge`, so a create run in another repo
// (`cd ../site && gh pr create`) is acted on there, not on the session's repo.
export function createdPr(command: string, output: string): string | undefined {
  const creates = segments(command).some((s) => { const { cmd, args } = commandOf(s.words); return cmd === 'gh' && args[0] === 'pr' && args[1] === 'create' && !args.includes('--draft') && !args.includes('-d'); });
  if (!creates) return undefined;
  return /https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+/.exec(output)?.[0];
}

// A PR held back from auto-merge: a draft, or one labelled for the owner (`awaiting-user`) or Codex.
export function heldPr(info: { isDraft?: boolean; autoMergeRequest?: unknown; labels?: { name: string }[] }): 'draft' | 'label' | null {
  if (info.isDraft) return 'draft';
  return info.labels?.some((l) => l.name === 'awaiting-user' || l.name === 'codex') ? 'label' : null;
}

// A command that runs a render or a capture: the checks, captures, benches and renders that take the GPU
// slot and starve when the machine is loaded. Only a program that runs it counts, not a commit message or a
// grep that mentions the path.
const RENDER_JOB = /with-render-lock\.sh|scripts\/capture\.js|npm (run )?capture|scripts\/reels\/|scripts\/feature-media\/render\.mjs|blender\/checks\/(golden|sweep|stage|clip|standup|pose|onscreen|scene|dump)|scripts\/perf\/bench|scripts\/snap\.js|npm run (snap|gates)\b/;
const RUNNERS = /^(node|npm|npx|bash|sh|timeout|nice|env)$/;

export function isRenderJob(command: string): boolean {
  return segments(command).some((s) => {
    const { cmd, args } = commandOf(s.words);
    if (!cmd || cmd === 'git' || cmd === 'gh' || cmd === 'grep' || cmd === 'rg' || cmd === 'cat' || cmd === 'echo') return false;
    if (!RUNNERS.test(cmd) && !cmd.endsWith('.sh')) return false;
    return RENDER_JOB.test([cmd, ...args].join(' '));
  });
}

// The 1-minute load average from /proc/loadavg text, or null when it does not read as one.
export function loadOf(text: string): number | null {
  const n = Number.parseFloat(text.trim().split(/\s+/)[0] ?? '');
  return Number.isFinite(n) ? n : null;
}

// A shell prefix that waits for the 1-minute load to drop below `limit` (polling every 15 s, at most
// `max` times), for a background command that must not hold the turn.
export function loadWaitPrefix(limit: number, max: number): string {
  return `bash -c 'i=0; while [ "$(cut -d. -f1 /proc/loadavg)" -ge ${limit} ] && [ $i -lt ${max} ]; do sleep 15; i=$((i+1)); done'; `;
}

// Local paths in the --body and --title values of a `gh pr create|edit|comment` made repo-relative:
// each root given (this checkout and its sibling worktrees, as absolute paths). Anything else in the
// command (a cd, a --body-file, another project's path) is left as written.
const TEXT_FLAG = /((?:^|\s)(?:--body|--title|-b|-t)(?:=|\s+))("(?:\\[\s\S]|[^"\\])*"|'[^']*'|\S+)/g;

export function repoRelative(command: string, roots: (string | null)[]): string {
  const rs = [...new Set(roots.filter((r): r is string => !!r))].sort((a, b) => b.length - a.length);
  if (!rs.length) return command;
  let out = command;
  for (const s of segments(command)) {
    const { cmd, args } = commandOf(s.words);
    if (!(cmd === 'gh' && args[0] === 'pr' && ['create', 'edit', 'comment'].includes(args[1] ?? ''))) continue;
    const fixed = s.text.replace(TEXT_FLAG, (_m, flag: string, val: string) => flag + rs.reduce((v, r) => v.split(`${r}/`).join(''), val));
    if (fixed !== s.text) out = out.replace(s.text, () => fixed);
  }
  return out;
}

// A background task's notification, as the row the session keeps reads: the output file, the status
// and exit code, and for a Bash task its command.
export type Notice = { outputFile: string; status: string; exitCode: number | null; command: string | null };

export function parseNotice(text: string): Notice | null {
  const file = /<output-file>([^<]+)<\/output-file>/.exec(text)?.[1]?.trim();
  if (!file) return null;
  const summary = /<summary>([\s\S]*?)<\/summary>/.exec(text)?.[1] ?? '';
  const command = /^Background command "([\s\S]*)" (?:completed|failed|was stopped)/.exec(summary)?.[1] ?? null;
  const code = /exit code (\d+)/.exec(summary)?.[1];
  return { outputFile: file, status: /<status>(\w+)<\/status>/.exec(text)?.[1] ?? '', exitCode: code === undefined ? null : Number(code), command: command?.replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&quot;/g, '"') ?? null };
}

// Checks and test runs print result rows; a run of one that exits 0 with none printed is suspect (a
// skipped cache hit says so in its own words and counts as a row).
const WANTS_ROWS = /blender\/checks\/|scripts\/studio\/|scripts\/balance|npm (run )?test|vitest|parity\.mjs/;
const RESULT_ROW = /^(CLIP|MATRIX|SWEEP|STAGEROW|CELL|SCENE|STAGE)\b|^(parity|pose|clip|stage|sweep|studio clip):|\bTests\s+\d+ (passed|failed)|\bTest Files\b|inputs unchanged since|skipped/m;

export function noticeNote(n: Notice, tail: string): string {
  const lines = [`hitl-guards: ${n.command ? 'background command' : 'background task'} ${n.status || 'ended'}${n.exitCode === null ? '' : ` with exit ${n.exitCode}`}.`];
  if (n.exitCode === 0 && n.command && WANTS_ROWS.test(n.command) && !RESULT_ROW.test(tail)) lines.push('Warning: exit 0, no result rows in its last lines. Check the log before trusting it as a pass.');
  lines.push(tail.trim() ? `Last lines of its output:\n${tail.trimEnd()}` : 'Its output is empty.');
  return lines.join('\n');
}
