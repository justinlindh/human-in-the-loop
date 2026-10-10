// Ends a process that overran its time limit, even one stuck in a synchronous stretch where its own timers
// cannot fire. The owner starts this as a child with a pipe on stdin; when that pipe closes (the owner exited,
// however) the watchdog exits too.
//
//   watchdog.mjs <pid> <seconds> [<message>]
//
// After <seconds> it prints <message> on stderr, sends <pid> SIGTERM, and SIGKILL 5 s later if it is still there.
const [pid, seconds, message] = process.argv.slice(2);
if (!/^\d+$/.test(pid ?? '') || !(Number(seconds) > 0)) { console.error('watchdog: usage: watchdog.mjs <pid> <seconds> [<message>]'); process.exit(2); }
const alive = () => { try { process.kill(Number(pid), 0); return true; } catch { return false; } };
process.stdin.on('close', () => process.exit(0));
process.stdin.on('error', () => process.exit(0));
process.stdin.resume();
// A signal meant for the owner's group must not end the watchdog first.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => {});
setTimeout(() => {
  if (!alive()) process.exit(0);
  if (message) console.error(message);
  try { process.kill(Number(pid), 'SIGTERM'); } catch { process.exit(0); }
  setTimeout(() => { if (alive()) try { process.kill(Number(pid), 'SIGKILL'); } catch { /* gone */ } process.exit(0); }, 5000);
}, Number(seconds) * 1000);
