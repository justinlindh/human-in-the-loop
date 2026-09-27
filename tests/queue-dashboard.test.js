import { test, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('queue dashboard preserves review, authentication and live-update boundaries', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, ['--test', 'scripts/queue-dashboard/dashboard.test.mjs'], { timeout: 15000 });
  expect(stdout).toMatch(/(?:fail 0|# fail 0)/);
}, 20000);
