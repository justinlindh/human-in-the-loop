import { createHash } from 'node:crypto';

export const captureKey = (build, item) => createHash('sha256').update(`${build}\n${JSON.stringify(item)}`).digest('hex');

// Cross-build reuse is explicit and requires the same capture specification and passing subject checks.
export function canReuse({ beat, item, record, key }) {
  if (beat.id === 'yak' || beat.id === 'yak-react' || !record?.build || record.errors !== 0) return false;
  if (key !== captureKey(record.build, item)) return false;
  const checks = record.marks?.filter(m => m.label === 'beat-check' && m.beat === beat.id) ?? [];
  return checks.length > 0 && checks.every(m => !!m.ok) && checks.some(m => Math.abs(m.t - beat.from) < 1e-6);
}
