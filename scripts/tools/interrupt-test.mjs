#!/usr/bin/env node
// Interrupts a command the way a lane's Ctrl-C or a timeout does, and reports what it left behind.
//
//   node scripts/tools/interrupt-test.mjs [--after <s>] [--signal TERM|INT|HUP] [--grace <s>] [--expect <codes>] -- <command> [args...]
//
// The command starts in a process group of its own with a scratch TMPDIR (and HITL_TMP). After --after
// seconds (default 5) the whole group gets the signal (default TERM). The report is the command's exit
// (a code, or the signal that ended it), the processes of its tree that are still alive afterwards, and
// the temp directories it left in its scratch dir. Survivors are then killed by pid. Exit 0 when the
// command ended within --grace seconds (default 15) with an expected code (default 130,143, or the
// signal itself), left nothing running and left no temp directory; 1 when it did not; 2 for bad options
// or a command that ended before the interrupt.
import { spawn, execFileSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import { makeTemp } from './tmp.mjs';

const USAGE = 'usage: node scripts/tools/interrupt-test.mjs [--after <s>] [--signal TERM|INT|HUP] [--grace <s>] [--expect <codes>] -- <command> [args...]';
const fail = (msg) => { console.error(`interrupt-test: ${msg}\n${USAGE}`); process.exit(2); };

const argv = process.argv.slice(2);
const dash = argv.indexOf('--');
if (argv.includes('--help') || argv.includes('-h')) { console.log(USAGE); process.exit(0); }
if (dash < 0 || dash === argv.length - 1) fail('a command is needed after --');
const own = argv.slice(0, dash), command = argv.slice(dash + 1);
const opts = { after: 5, signal: 'TERM', grace: 15, expect: '130,143' };
for (let i = 0; i < own.length; i += 2) {
  const flag = own[i].replace(/^--/, '');
  if (!(flag in opts) || own[i + 1] === undefined || own[i + 1].startsWith('--')) fail(`${own[i]} ${own[i + 1] === undefined ? 'needs a value' : 'is not an option'}`);
  opts[flag] = own[i + 1];
}
const after = Number(opts.after), grace = Number(opts.grace);
if (!(after >= 0) || !(grace > 0)) fail('--after and --grace take seconds');
if (!['TERM', 'INT', 'HUP'].includes(opts.signal)) fail(`--signal wants TERM, INT or HUP (got ${opts.signal})`);
const expected = opts.expect.split(',').map((s) => s.trim()).filter(Boolean);
const SIG = `SIG${opts.signal}`;

// Every process as { pid, ppid, pgid, args }.
function table() {
  const out = execFileSync('ps', ['-eo', 'pid=,ppid=,pgid=,args='], { encoding: 'utf8' });
  return out.split('\n').map((l) => /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(l)).filter(Boolean).map((m) => ({ pid: +m[1], ppid: +m[2], pgid: +m[3], args: m[4] }));
}
// The command's tree: its process group plus every descendant, whatever group it moved to.
function tree(root) {
  const all = table(), ids = new Set([root]);
  for (let grew = true; grew;) { grew = false; for (const p of all) if (!ids.has(p.pid) && (ids.has(p.ppid) || p.pgid === root)) { ids.add(p.pid); grew = true; } }
  return all.filter((p) => ids.has(p.pid) && p.pid !== process.pid);
}
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const scratch = makeTemp('interrupt-');
const child = spawn(command[0], command.slice(1), { detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, TMPDIR: scratch, HITL_TMP: scratch } });
let started = true;
child.on('error', (e) => { started = false; rmSync(scratch, { recursive: true, force: true }); fail(`cannot start ${command[0]}: ${e.message}`); });
let tail = [];
for (const s of [child.stdout, child.stderr]) s.on('data', (d) => { tail = [...tail, ...String(d).split('\n').filter(Boolean)].slice(-4); });
const ended = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));

let exit = null;
ended.then((x) => { exit = x; });
await Promise.race([sleep(after * 1000), ended]);
if (exit) {
  rmSync(scratch, { recursive: true, force: true });
  console.log(`interrupt-test: the command ended by itself before ${opts.after} s (${exit.signal ?? `exit ${exit.code}`}); nothing was interrupted`);
  process.exit(2);
}
const before = started ? tree(child.pid) : [];
console.log(`interrupt-test: ran \`${command.join(' ')}\` for ${opts.after} s (${before.length} process${before.length === 1 ? '' : 'es'} in its tree), sent ${SIG} to its process group`);
try { process.kill(-child.pid, SIG); } catch { /* already gone */ }
const done = await Promise.race([ended, sleep(grace * 1000).then(() => null)]);
let stuck = false;
if (!done) { stuck = true; try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } await ended; }
await sleep(500);
const how = (x) => (x.signal ? `signal ${x.signal}` : String(x.code));
const result = done ?? (await ended);
const survivors = before.filter((p) => alive(p.pid)).concat(tree(child.pid).filter((p) => !before.some((b) => b.pid === p.pid)));
const leftovers = readdirSync(scratch);
const okExit = !stuck && (expected.includes(String(result.code)) || (result.signal !== null && result.signal === SIG));

console.log(stuck ? `exit: still running ${grace} s after ${SIG}; killed with SIGKILL` : `exit: ${how(result)}${okExit ? '' : ` (expected ${expected.join(' or ')} or ${SIG})`}`);
console.log(survivors.length ? `survivors:\n${survivors.map((p) => `  pid ${p.pid} ${p.args.slice(0, 100)}`).join('\n')}` : 'survivors: none');
console.log(leftovers.length ? `leftover temp dirs:\n${leftovers.map((n) => `  ${n}`).join('\n')}` : 'leftover temp dirs: none');
if (tail.length) console.log(`last output:\n${tail.map((l) => `  ${l.slice(0, 160)}`).join('\n')}`);
for (const p of survivors) { try { process.kill(p.pid, 'SIGKILL'); } catch { /* gone */ } }
rmSync(scratch, { recursive: true, force: true });
const clean = okExit && !survivors.length && !leftovers.length;
console.log(clean ? 'interrupt-test: ok' : 'interrupt-test: the interrupt left something behind or ended wrongly');
process.exit(clean ? 0 : 1);
