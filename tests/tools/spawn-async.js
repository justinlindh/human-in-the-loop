import { spawn } from 'node:child_process';

// spawnSync's result shape from an async spawn, so a test's independent runs wait side by side
// (`await Promise.all([...])`) instead of one after another.
export function spawnAsync(cmd, args, { timeout = 180000, ...opts } = {}) {
  return new Promise((done) => {
    const p = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    p.stdout.on('data', (d) => { stdout += d; });
    p.stderr.on('data', (d) => { stderr += d; });
    const t = setTimeout(() => p.kill('SIGKILL'), timeout);
    p.on('close', (status, signal) => { clearTimeout(t); done({ status, signal, stdout, stderr }); });
  });
}
