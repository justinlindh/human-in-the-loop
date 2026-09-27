import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import { installDrawAudit } from '../blender/checks/draw-audit.js';

function fixture() {
  const submissions = [];
  const extension = { drawElementsInstancedANGLE(...args) { submissions.push({ receiver: this, args }); return 17; } };
  class GL {
    getExtension() { return extension; }
    drawArrays(...args) { submissions.push({ receiver: this, args }); return 42; }
    drawElements() { throw new Error('driver error'); }
  }
  class GL2 extends GL {
    drawElementsInstanced(...args) { submissions.push({ receiver: this, args }); }
  }
  const page = { WebGLRenderingContext: GL, WebGL2RenderingContext: GL2, performance: { now: () => 123 } };
  page.window = page;
  runInNewContext(`(${installDrawAudit.toString()})()`, page);
  return { page, GL, GL2, submissions, extension };
}

describe('actual WebGL draw audit', () => {
  it('counts all contexts without swallowing calls, arguments or return values', () => {
    const { page, GL, GL2, submissions } = fixture();
    const a = new GL(), b = new GL2();
    expect(a.drawArrays(4, 0, 3)).toBe(42);
    b.drawArrays(4, 1, 9);
    b.drawElementsInstanced(4, 3, 5123, 0, 2);
    expect(page.__drawAudit()).toEqual({ total: 3, calls: { drawArrays: 2, drawElementsInstanced: 1 } });
    expect(submissions).toEqual([{ receiver: a, args: [4, 0, 3] }, { receiver: b, args: [4, 1, 9] }, { receiver: b, args: [4, 3, 5123, 0, 2] }]);
  });

  it('counts extensions once even when repeatedly acquired through inherited methods', () => {
    const { page, GL2, extension } = fixture();
    const gl = new GL2();
    gl.getExtension('ANGLE_instanced_arrays');
    expect(gl.getExtension('ANGLE_instanced_arrays').drawElementsInstancedANGLE(4, 3, 5123, 0, 2)).toBe(17);
    expect(page.__drawAudit().total).toBe(1);
    expect(extension.drawElementsInstancedANGLE).toBeTypeOf('function');
  });

  it('preserves errors, immutable snapshots and a clock independent of the frozen scene time', () => {
    const { page, GL } = fixture();
    const before = page.__drawAudit();
    expect(() => new GL().drawElements()).toThrow('driver error');
    expect(before).toEqual({ total: 0, calls: {} });
    expect(page.__drawAudit().total).toBe(1);
    page.performance.now = () => 0;
    expect(page.__wallNow()).toBe(123);
  });
});
